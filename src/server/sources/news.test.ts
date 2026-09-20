import { beforeEach, describe, expect, it } from "vitest";
import { getNews } from "@/server/sources/news";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
import { rssConfig } from "@/server/config";
import { NEWS_TTL_MS, PARTIAL_FAIL_TTL_MS, SOURCE_LIMITS } from "@/shared/config";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import type { NewsCategory, NewsItem } from "@/shared/types";
import type { AppContext } from "@/server/context";

const INDUSTRY_A = rssConfig.industry[0]!;
const INDUSTRY_B = rssConfig.industry[1]!;
const INDUSTRY_C = rssConfig.industry[2]!;
const RESEARCH_A = rssConfig.research[0]!;
const RESEARCH_B = rssConfig.research[1]!;
const RESEARCH_C = rssConfig.research[2]!;

const entry = (title: string, link: string, pubDate: string) => ({ title, link, pubDate });

function feed(name: string, items: { title: string; link: string; pubDate: string }[]): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><guid isPermaLink="false">${name}-${i.title}</guid>` +
        `<pubDate>${i.pubDate}</pubDate></item>`,
    )
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>${body}</channel></rss>`;
}

const many = (name: string, count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) =>
    entry(`${name}-${i + offset}`, `https://${name}.example/${i}`, "2026-09-01T00:00:00Z"),
  );

function paper(id: string, title: string, upvotes = 10) {
  return { paper: { id, title, upvotes, publishedAt: "2026-09-02T00:00:00Z" } };
}

const paperLink = (id: string) => `https://huggingface.co/papers/${id}`;

function newsCtx(feeds: Record<string, string>, papers: unknown[] = []) {
  const seen: string[] = [];
  const http = {
    text: async (url: string) => {
      seen.push(url);
      const body = feeds[url];
      if (body === undefined) throw new Error(`feed unreachable: ${url}`);
      return body;
    },
    json: async () => papers,
  } as unknown as AppContext["http"];
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, seen };
}

const titles = (items: NewsItem[]) => items.map((i) => i.title);

/** CacheService jitters stored ttl to 0.95-1.0x of the requested one. */
function expectJitteredTtl(actual: number | undefined, target: number): void {
  expect(actual).toBeGreaterThanOrEqual(target * 0.95);
  expect(actual).toBeLessThanOrEqual(target);
}

describe("getNews", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("merges every feed leg and caps the result at newsPerCategory", async () => {
    const { ctx } = newsCtx({
      [INDUSTRY_A]: feed("a", many("a", 15)),
      [INDUSTRY_B]: feed("b", many("b", 15)),
      [INDUSTRY_C]: feed("c", many("c", 15)),
    });
    const payload = await getNews(ctx, "industry");
    expect(payload.data).toHaveLength(SOURCE_LIMITS.newsPerCategory);
    expect(payload.partial).toBeUndefined();
  });

  it("reserves head slots for papers, capped at hfPapersQuota", async () => {
    const papers = Array.from({ length: 8 }, (_, i) => paper(`2409.0000${i}`, `Paper ${i}`));
    const { ctx } = newsCtx(
      {
        [RESEARCH_A]: feed("arxiv-a", many("news", 3)),
        [RESEARCH_B]: feed("arxiv-b", []),
        [RESEARCH_C]: feed("import-ai", many("blog", 3, 10)),
      },
      papers,
    );
    const payload = await getNews(ctx, "research");
    const items = payload.data;
    expect(items.filter((i) => i.id.startsWith("hf-paper-"))).toHaveLength(SOURCE_LIMITS.hfPapersQuota);
    expect(titles(items).slice(0, SOURCE_LIMITS.hfPapersQuota)).toEqual(
      Array.from({ length: SOURCE_LIMITS.hfPapersQuota }, (_, i) => `Paper ${i}`),
    );
    expect(items).toHaveLength(SOURCE_LIMITS.hfPapersQuota + 6);
  });

  it("orders papers by upvotes before the quota slice", async () => {
    const { ctx } = newsCtx({ [RESEARCH_A]: feed("a", []), [RESEARCH_B]: feed("b", []), [RESEARCH_C]: feed("c", []) }, [
      paper("low", "Low", 1),
      paper("high", "High", 99),
      paper("mid", "Mid", 5),
    ]);
    const items = await getNews(ctx, "research").then((p) => p.data);
    expect(titles(items)).toEqual(["High", "Mid", "Low"]);
  });

  it("dedupes repeated links and drops items that duplicate a paper link", async () => {
    const { ctx } = newsCtx({
      [INDUSTRY_A]: feed("a", [
        entry("Dup 1", "https://shared.example/post", "2026-09-01T00:00:00Z"),
        entry("Dup 2", "https://shared.example/post/", "2026-09-01T00:00:00Z"),
      ]),
      [INDUSTRY_B]: feed("b", [entry("Dup 3", "https://SHARED.example/post/", "2026-09-01T00:00:00Z")]),
      [INDUSTRY_C]: feed("c", [entry("Kept", "https://other.example/post", "2026-09-01T00:00:00Z")]),
    });
    const items = await getNews(ctx, "industry").then((p) => p.data);
    expect(titles(items)).toEqual(["Dup 1", "Kept"]);
  });

  it("excludes a non-paper item that shares a paper's link", async () => {
    const { ctx } = newsCtx(
      {
        [RESEARCH_A]: feed("a", [entry("Same As Paper", paperLink("2409.77777"), "2026-09-01T00:00:00Z")]),
        [RESEARCH_B]: feed("b", []),
        [RESEARCH_C]: feed("c", []),
      },
      [paper("2409.77777", "The Paper")],
    );
    const items = await getNews(ctx, "research").then((p) => p.data);
    expect(titles(items)).toEqual(["The Paper"]);
  });

  it("sorts newest first and sinks undated items last", async () => {
    const { ctx } = newsCtx({
      [INDUSTRY_A]: feed("a", [
        entry("Undated", "https://a.example/1", "not a date"),
        entry("Oldest", "https://a.example/2", "2026-08-01T00:00:00Z"),
        entry("Newest", "https://a.example/3", "2026-09-09T00:00:00Z"),
      ]),
      [INDUSTRY_B]: feed("b", []),
      [INDUSTRY_C]: feed("c", []),
    });
    const items = await getNews(ctx, "industry").then((p) => p.data);
    expect(titles(items)).toEqual(["Newest", "Oldest", "Undated"]);
  });

  it("flags partial and shortens the cache ttl when one leg fails", async () => {
    const { ctx, kvStore } = newsCtx({
      [INDUSTRY_A]: feed("a", many("a", 2)),
      [INDUSTRY_B]: feed("b", many("b", 2, 10)),
    });
    const payload = await getNews(ctx, "industry");
    expect(payload.partial).toBe(true);
    expect(payload.data).toHaveLength(4);

    const envelopeKey = [...kvStore.keys()][0];
    expect(envelopeKey).toBeDefined();
    const envelope = JSON.parse(kvStore.get(envelopeKey!) ?? "{}") as {
      t?: number;
      d?: { data: NewsItem[]; partial?: boolean };
    };
    expectJitteredTtl(envelope.t, PARTIAL_FAIL_TTL_MS);
    expect(envelope.d?.partial).toBe(true);
    expect(envelope.d?.data).toHaveLength(4);
  });

  it("keeps the full ttl while every leg is healthy", async () => {
    const { ctx, kvStore } = newsCtx({
      [INDUSTRY_A]: feed("a", many("a", 2)),
      [INDUSTRY_B]: feed("b", many("b", 2, 10)),
      [INDUSTRY_C]: feed("c", many("c", 2, 20)),
    });
    const payload = await getNews(ctx, "industry");
    expect(payload.partial).toBeUndefined();
    const envelope = JSON.parse(kvStore.get([...kvStore.keys()][0]!) ?? "{}") as { t?: number };
    expectJitteredTtl(envelope.t, NEWS_TTL_MS);
    expect(NEWS_TTL_MS).toBeGreaterThan(PARTIAL_FAIL_TTL_MS);
  });

  it("throws UpstreamError when every leg fails", async () => {
    const { ctx } = newsCtx({});
    await expect(getNews(ctx, "hardware")).rejects.toThrowError(
      new UpstreamError(`All ${rssConfig.hardware.length} RSS feed(s) for "hardware" failed`).message,
    );
  });

  it("rejects an unknown category without touching the network", async () => {
    const { ctx, seen } = newsCtx({});
    await expect(getNews(ctx, "no-such-category" as NewsCategory)).rejects.toThrowError(ValidationError);
    expect(seen).toEqual([]);
  });

  it("serves the cached payload instead of refetching", async () => {
    const feeds = {
      [INDUSTRY_A]: feed("a", [entry("Cached", "https://a.example/1", "2026-09-01T00:00:00Z")]),
      [INDUSTRY_B]: feed("b", []),
      [INDUSTRY_C]: feed("c", []),
    };
    const { ctx, seen } = newsCtx(feeds);
    const first = await getNews(ctx, "industry");
    const second = await getNews(ctx, "industry");
    expect(second.data).toEqual(first.data);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(seen).toHaveLength(rssConfig.industry.length);
  });

  it("keys the cache per category", async () => {
    const { ctx, kvStore } = newsCtx({
      [INDUSTRY_A]: feed("a", [entry("Industry", "https://a.example/1", "2026-09-01T00:00:00Z")]),
      [INDUSTRY_B]: feed("b", []),
      [INDUSTRY_C]: feed("c", []),
    });
    await getNews(ctx, "industry");
    expect([...kvStore.keys()]).toEqual(["v-test:news:industry"]);

    const research = newsCtx(
      { [RESEARCH_A]: feed("ra", []), [RESEARCH_B]: feed("rb", []), [RESEARCH_C]: feed("rc", []) },
      [paper("2409.1", "Research Only")],
    );
    await getNews(research.ctx, "research");
    expect([...research.kvStore.keys()]).toEqual(["v-test:news:research"]);
  });
});

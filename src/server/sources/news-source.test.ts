import { beforeEach, describe, expect, it } from "vitest";
import { getNews } from "@/server/sources/news-source";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import { rssConfig } from "@/server/config";
import { PARTIAL_FAIL_TTL_MS, SOURCE_LIMITS } from "@/shared/config";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import type { NewsCategory, NewsItem } from "@/shared/types";

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

/** Fake upstream routed by URL: a missing feed fails the fetch, like a down leg. */
function newsCtx(feeds: Record<string, string>, papers: unknown[] = []) {
  const http = fakeHttp({ text: feeds, json: () => papers });
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, seen: http.calls };
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

  it("reserves head slots for top-upvoted papers, capped at hfPapersQuota", async () => {
    const upvotes = [3, 30, 1, 20, 2, 10, 5, 15];
    const papers = upvotes.map((upvotes, i) => paper(`2409.0000${i}`, `Paper ${i}`, upvotes));
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
    expect(titles(items).slice(0, SOURCE_LIMITS.hfPapersQuota)).toEqual([
      "Paper 1",
      "Paper 3",
      "Paper 7",
      "Paper 5",
      "Paper 6",
    ]);
    expect(items).toHaveLength(SOURCE_LIMITS.hfPapersQuota + 6);
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
});

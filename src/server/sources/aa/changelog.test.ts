import { beforeEach, describe, expect, it } from "vitest";
import { getChangelogModels } from "@/server/sources/aa/changelog";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
import { MAX_FEED_BYTES, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { SOURCE_LIMITS } from "@/shared/config";
import type { AppContext } from "@/server/context";

const CHANGELOG_URL = `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaChangelog}`;

function changelogEntry(slug: string, releaseDate: string) {
  return {
    slug,
    name: slug,
    deprecated: false,
    isReasoning: false,
    effort: null,
    release: { slug, name: slug },
    releaseDate,
    creator: { id: "aa", name: "Anthropic" },
  };
}

function changelogHtml(entries: unknown[]): string {
  const payload = JSON.stringify({ models: entries }).replace(/"/g, '\\"');
  return `<html><body><script>self.__next_f.push([1,"${payload}"])</script></body></html>`;
}

function changelogCtx(body: string) {
  const calls: { url: string; init: unknown; maxBytes: unknown }[] = [];
  const http = {
    text: async (url: string, init: unknown, maxBytes: unknown) => {
      calls.push({ url, init, maxBytes });
      return body;
    },
  } as unknown as AppContext["http"];
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, calls };
}

describe("getChangelogModels", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("returns the parsed rows newest-first", async () => {
    const { ctx } = changelogCtx(
      changelogHtml([changelogEntry("older", "2025-01-02"), changelogEntry("newer", "2026-03-04")]),
    );
    const models = await getChangelogModels(ctx);
    expect(models.map((m) => m.slug)).toEqual(["newer", "older"]);
  });

  it("requests the AA changelog with the feed byte ceiling", async () => {
    const { ctx, calls } = changelogCtx(changelogHtml([changelogEntry("m1", "2026-01-02")]));
    await getChangelogModels(ctx);
    const [first] = calls;
    expect(first?.url).toBe(CHANGELOG_URL);
    expect(first?.maxBytes).toBe(MAX_FEED_BYTES);
    const init = first?.init as { headers: Record<string, string>; timeoutMs: number } | undefined;
    expect(init?.headers.accept).toContain("text/html");
    expect(init?.timeoutMs).toBe(10_000);
  });

  it("caps the result at the changelog limit", async () => {
    const entries = Array.from({ length: SOURCE_LIMITS.changelog + 50 }, (_, i) =>
      changelogEntry(`model-${i}`, "2026-01-01"),
    );
    const { ctx } = changelogCtx(changelogHtml(entries));
    expect(await getChangelogModels(ctx)).toHaveLength(SOURCE_LIMITS.changelog);
  });

  it("fails loudly when the markup yields no models, reporting the body size", async () => {
    const { ctx, calls } = changelogCtx("<html><body>redesigned</body></html>");
    await expect(getChangelogModels(ctx)).rejects.toThrowError(
      /AA changelog yielded 0 models \(raw=1 page, kept=0, markup changed\?, body=\d+B\)/,
    );
    expect(calls).toHaveLength(1);
  });

  it("caches the parsed rows so the second call skips upstream", async () => {
    const { ctx, calls } = changelogCtx(changelogHtml([changelogEntry("m1", "2026-01-02")]));
    const first = await getChangelogModels(ctx);
    const second = await getChangelogModels(ctx);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });
});

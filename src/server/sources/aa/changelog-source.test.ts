import { beforeEach, describe, expect, it } from "vitest";
import { getChangelogModels } from "@/server/sources/aa/changelog-source";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import { upstreamConfig, upstreamEndpoints } from "@/server/config";

const INDEX_URL = `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaIndex}`;
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

function aaCtx(routes: Record<string, string>) {
  const http = fakeHttp({ text: routes });
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, calls: http.calls };
}

describe("getChangelogModels", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("derives the rows from the cached index body without fetching /changelog", async () => {
    const entries = [changelogEntry("older", "2025-01-02"), changelogEntry("newer", "2026-03-04")];
    const { ctx, calls } = aaCtx({ [INDEX_URL]: changelogHtml(entries) });
    const models = await getChangelogModels(ctx);
    expect(models.map((m) => m.slug)).toEqual(["newer", "older"]);
    expect(calls).toEqual([INDEX_URL]);
  });

  it("falls back to /changelog when the index body cannot be read", async () => {
    const entries = [changelogEntry("only", "2026-01-01")];
    const { ctx, calls } = aaCtx({ [CHANGELOG_URL]: changelogHtml(entries) });
    expect((await getChangelogModels(ctx)).map((m) => m.slug)).toEqual(["only"]);
    expect(calls).toEqual([INDEX_URL, CHANGELOG_URL]);
  });

  it("keeps every parsed model: a bounded upstream needs no fetch cap", async () => {
    const entries = Array.from({ length: 250 }, (_, i) => changelogEntry(`model-${i}`, "2026-01-01"));
    const { ctx } = aaCtx({ [INDEX_URL]: changelogHtml(entries) });
    expect(await getChangelogModels(ctx)).toHaveLength(250);
  });

  it("fails loudly when neither the index body nor the page yields models", async () => {
    const redesigned = "<html><body>redesigned</body></html>";
    const { ctx, calls } = aaCtx({ [INDEX_URL]: redesigned, [CHANGELOG_URL]: redesigned });
    await expect(getChangelogModels(ctx)).rejects.toThrowError(
      /AA changelog yielded 0 models \(raw=1 page, kept=0, markup changed\?, body=\d+B\)/,
    );
    expect(calls).toEqual([INDEX_URL, CHANGELOG_URL]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { getChangelogModels } from "@/server/sources/aa/changelog-source";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { testCtx } from "@/server/test-helpers";
import type { AppContext } from "@/server/context";

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

  it("keeps every parsed model: a bounded upstream needs no fetch cap", async () => {
    const entries = Array.from({ length: 250 }, (_, i) => changelogEntry(`model-${i}`, "2026-01-01"));
    const { ctx } = changelogCtx(changelogHtml(entries));
    expect(await getChangelogModels(ctx)).toHaveLength(250);
  });

  it("fails loudly when the markup yields no models, reporting the body size", async () => {
    const { ctx, calls } = changelogCtx("<html><body>redesigned</body></html>");
    await expect(getChangelogModels(ctx)).rejects.toThrowError(
      /AA changelog yielded 0 models \(raw=1 page, kept=0, markup changed\?, body=\d+B\)/,
    );
    expect(calls).toHaveLength(1);
  });
});

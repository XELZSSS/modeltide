import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import { cacheKeys, upstreamEndpoints } from "@/server/config";
import { getIntelligenceIndex, getIntelligenceIndexResult } from "@/server/sources/aa/index-source";

vi.mock("@/server/sources/openrouter-directory", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/openrouter-directory")>();
  return { ...mod, getModelDirectory: vi.fn() };
});

import { getModelDirectory } from "@/server/sources/openrouter-directory";

const MODEL = { id: "m1", slug: "gpt-5", name: "GPT-5", intelligenceIndex: 80, isOpenWeights: false };

/** One flight line carrying both markers the index page is parsed for. */
const indexBody = `1:${JSON.stringify({ models: [MODEL] })}`;
/** Enrichment pages are separate documents, each with its own marker. */
const modelsPage = `2:${JSON.stringify({ initialModels: [{ slug: "gpt-5", creator: { name: "OpenAI" } }] })}`;
const omnisciencePage = `2:${JSON.stringify({
  initialModels: [
    { slug: "gpt-5", omniscienceBreakdown: { accuracy: 0.88, attemptRate: 0.7, hallucinationRate: 0.1 } },
  ],
})}`;

/** Counting fake upstream for the AA legs the index build reads; `legsUp` can flip mid-test. */
function aaCtx(legsUp: () => boolean = () => true) {
  const http = fakeHttp({
    text: (url) => {
      if (url.endsWith(upstreamEndpoints.aaIndex)) return indexBody;
      if (!legsUp()) throw new Error("leg down");
      if (url.endsWith(upstreamEndpoints.aaModels)) return modelsPage;
      if (url.endsWith(upstreamEndpoints.aaOmniscience)) return omnisciencePage;
      throw new Error(`unexpected url ${url}`);
    },
  });
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, callsTo: (path: string) => http.calls.filter((url) => url.endsWith(path)).length };
}

describe("getIntelligenceIndex", () => {
  beforeEach(() => {
    resetModuleCachesForTests();
    vi.mocked(getModelDirectory).mockResolvedValue({ pricing: {}, meta: {} } as never);
  });

  it("returns the compacted catalog with an honest fetchedAt", async () => {
    const { ctx } = aaCtx();
    const payload = await getIntelligenceIndex(ctx);
    expect(payload.data.map((m) => m.slug)).toEqual(["gpt-5"]);
    expect(payload.partial).toBeUndefined();
    expect(Number.isNaN(Date.parse(payload.fetchedAt))).toBe(false);
  });

  it("keeps the original fetchedAt on a cache hit instead of re-stamping it", async () => {
    const { ctx, callsTo } = aaCtx();
    const first = await getIntelligenceIndex(ctx);
    const second = await getIntelligenceIndex(ctx);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    // The closed-release consumer shares the same cached fetch.
    await getIntelligenceIndexResult(ctx);
    expect(callsTo(upstreamEndpoints.aaIndex)).toBe(1);
  });

  it("marks the payload partial when an enrichment leg comes back empty", async () => {
    const { ctx } = aaCtx(() => false);
    const payload = await getIntelligenceIndex(ctx);
    expect(payload.partial).toBe(true);
    const result = await getIntelligenceIndexResult(ctx);
    expect(result.enrichFailed).toBe(true);
    expect(result.fetchedAt).toBe(payload.fetchedAt);
  });

  it("reuses the enrichment bodies across index rebuilds", async () => {
    const { ctx, kvStore, callsTo } = aaCtx();
    await getIntelligenceIndex(ctx);
    expect(getModelDirectory).toHaveBeenCalledTimes(1);
    expect(callsTo(upstreamEndpoints.aaIndex)).toBe(1);
    expect(callsTo(upstreamEndpoints.aaModels)).toBe(1);
    expect(callsTo(upstreamEndpoints.aaOmniscience)).toBe(1);

    // Second build: expire the index entry and its raw body, as both would after
    // their own ceiling. The enrichment bodies keep their 2h TTL, so the rebuild
    // refetches the index page once and neither enrichment page.
    kvStore.delete(`v-test:${cacheKeys.intelligenceIndex}`);
    kvStore.delete(`v-test:${cacheKeys.aaIndexBody}`);
    resetModuleCachesForTests();

    await getIntelligenceIndex(ctx);
    expect(getModelDirectory).toHaveBeenCalledTimes(2);
    expect(callsTo(upstreamEndpoints.aaIndex)).toBe(2);
    expect(callsTo(upstreamEndpoints.aaModels)).toBe(1);
    expect(callsTo(upstreamEndpoints.aaOmniscience)).toBe(1);
  });

  it("retries a failed enrichment leg on the next build instead of caching the failure", async () => {
    let up = false;
    const { ctx, kvStore, callsTo } = aaCtx(() => up);
    await getIntelligenceIndex(ctx);
    expect(callsTo(upstreamEndpoints.aaModels)).toBe(1);

    up = true;
    kvStore.delete(`v-test:${cacheKeys.intelligenceIndex}`);
    resetModuleCachesForTests();

    const recovered = await getIntelligenceIndex(ctx);
    expect(callsTo(upstreamEndpoints.aaModels)).toBe(2);
    expect(recovered.partial).toBeUndefined();
  });
});

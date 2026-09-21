import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { testCtx } from "@/server/test-helpers";
import { getIntelligenceIndex, getIntelligenceIndexResult } from "@/server/sources/aa/index-source";

vi.mock("@/server/sources/aa/aa-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/aa-fetch")>();
  return { ...mod, fetchAaRsc: vi.fn(), fetchAndParseEnrich: vi.fn() };
});
vi.mock("@/server/sources/openrouter-directory", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/openrouter-directory")>();
  return { ...mod, getModelDirectory: vi.fn() };
});

import { fetchAaRsc, fetchAndParseEnrich } from "@/server/sources/aa/aa-fetch";
import { getModelDirectory } from "@/server/sources/openrouter-directory";

const MODEL = { id: "m1", slug: "gpt-5", name: "GPT-5", intelligenceIndex: 80, isOpenWeights: false };

/** One flight line carrying both markers the index page is parsed for. */
const indexBody = `1:${JSON.stringify({ models: [MODEL] })}`;

function mockHealthyIndex() {
  vi.mocked(fetchAaRsc).mockResolvedValue(indexBody);
  vi.mocked(fetchAndParseEnrich)
    .mockResolvedValueOnce([{ ...MODEL, creator: { name: "OpenAI" } }] as never)
    .mockResolvedValueOnce([{ slug: "gpt-5", omniscienceBreakdown: { total: { accuracy: 88 } } }] as never);
  vi.mocked(getModelDirectory).mockResolvedValue({ pricing: {}, meta: {} } as never);
}

describe("getIntelligenceIndex", () => {
  beforeEach(() => {
    resetModuleCachesForTests();
    vi.clearAllMocks();
    mockHealthyIndex();
  });

  it("returns the compacted catalog with an honest fetchedAt", async () => {
    const { ctx } = testCtx();
    const payload = await getIntelligenceIndex(ctx);
    expect(payload.data.map((m) => m.slug)).toEqual(["gpt-5"]);
    expect(payload.partial).toBeUndefined();
    expect(Number.isNaN(Date.parse(payload.fetchedAt))).toBe(false);
  });

  it("keeps the original fetchedAt on a cache hit instead of re-stamping it", async () => {
    const { ctx } = testCtx();
    const first = await getIntelligenceIndex(ctx);
    const second = await getIntelligenceIndex(ctx);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(fetchAaRsc).toHaveBeenCalledTimes(1);
  });

  it("marks the payload partial when an enrichment leg comes back empty", async () => {
    vi.mocked(fetchAndParseEnrich)
      .mockReset()
      .mockResolvedValue([] as never);
    const { ctx } = testCtx();
    const payload = await getIntelligenceIndex(ctx);
    expect(payload.partial).toBe(true);
    const result = await getIntelligenceIndexResult(ctx);
    expect(result.enrichFailed).toBe(true);
    expect(result.fetchedAt).toBe(payload.fetchedAt);
  });

  it("shares one cached fetch between the endpoint and the closed-release consumer", async () => {
    const { ctx } = testCtx();
    await getIntelligenceIndexResult(ctx);
    await getIntelligenceIndex(ctx);
    expect(fetchAaRsc).toHaveBeenCalledTimes(1);
  });
});

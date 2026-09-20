import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
import { UpstreamError } from "@/server/infra/errors";
import { getHomeDashboard } from "@/server/sources/home";
import { hfModelsPayload, openRouterRankingsPayload, textToImagePayload } from "@/server/sources/test-fixtures";

vi.mock("@/server/sources/openrouter", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/openrouter")>();
  return { ...mod, getOpenRouterRankings: vi.fn() };
});
vi.mock("@/server/sources/huggingface", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/huggingface")>();
  return { ...mod, getModels: vi.fn() };
});
vi.mock("@/server/sources/aa/text-to-image", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/text-to-image")>();
  return { ...mod, getTextToImageLeaderboard: vi.fn() };
});

import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getModels } from "@/server/sources/huggingface";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";

describe("getHomeDashboard", () => {
  beforeEach(() => resetModuleCachesForTests());

  function mockHealthyOthers() {
    vi.mocked(getOpenRouterRankings).mockResolvedValue(openRouterRankingsPayload());
    vi.mocked(getModels).mockResolvedValue(hfModelsPayload());
  }

  it("composes the inner sources and caches the outer snapshot", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue(textToImagePayload());
    const { ctx, kvStore } = testCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage?.data).toEqual([]);
    expect(data.orRankings?.tokenUsageRankings).toHaveLength(1);
    expect(data.opensource?.data).toHaveLength(1);
    // Outer assembly is memory-only (inner legs are KV-cached): zero KV writes.
    expect(kvStore.size).toBe(0);
    await expect(getHomeDashboard(ctx)).resolves.toEqual(data);
  });

  it("nulls the failed leg when an inner source rejects", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockRejectedValue(new Error("t2i down"));
    const { ctx } = testCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage).toBeNull();
    expect(data.orRankings).not.toBeNull();
  });

  it("throws when all inner sources fail", async () => {
    vi.mocked(getOpenRouterRankings).mockRejectedValue(new Error("or down"));
    vi.mocked(getModels).mockRejectedValue(new Error("hf down"));
    vi.mocked(getTextToImageLeaderboard).mockRejectedValue(new Error("t2i down"));
    const { ctx } = testCtx();
    await expect(getHomeDashboard(ctx)).rejects.toBeInstanceOf(UpstreamError);
  });
});

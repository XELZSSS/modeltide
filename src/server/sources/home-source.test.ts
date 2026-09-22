import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { testCtx } from "@/server/test-helpers";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { getHomeDashboard } from "@/server/sources/home-source";
import { hfModelsPayload, openRouterRankingsPayload, textToImagePayload } from "@/server/sources/test-fixtures";

vi.mock("@/server/sources/openrouter-source", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/openrouter-source")>();
  return { ...mod, getOpenRouterRankings: vi.fn() };
});
vi.mock("@/server/sources/hf-source", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/hf-source")>();
  return { ...mod, getModels: vi.fn() };
});
vi.mock("@/server/sources/aa/text-to-image-source", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/text-to-image-source")>();
  return { ...mod, getTextToImageLeaderboard: vi.fn() };
});

import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { getModels } from "@/server/sources/hf-source";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image-source";

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

  it("projects each leg down to the fields the home widgets read", async () => {
    // Production-shaped rows: 499 OpenRouter entries, 30 text-to-image models and
    // 200 Hugging Face rows carrying the 100 detail-only tags each.
    const orRows = Array.from({ length: 499 }, (_, i) => ({
      rank: i + 1,
      id: `vendor/model-${i}`,
      name: `Model ${i}`,
      creator: "Vendor",
      category: "general",
      totalTokens: 10_000 - i,
    }));
    const t2iRows = Array.from({ length: 30 }, (_, i) => ({
      id: `t2i-${i}`,
      slug: `t2i-${i}`,
      name: `T2I ${i}`,
      rank: i + 1,
      elo: 1200,
      eloLower: 1190,
      eloUpper: 1210,
      pricePer1kImages: 10,
      creatorName: "Creator",
    }));
    const hfRows = Array.from({ length: 200 }, (_, i) => ({
      id: `org/model-${i}`,
      author: "org",
      downloads: 1_000_000 - i,
      likes: 3,
      license: "mit",
      task: "text-generation",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastModified: "2026-02-01T00:00:00.000Z",
      tags: Array.from({ length: 100 }, (_, t) => `tag-${t}`),
    }));
    const fetchedAt = "2026-01-01T00:00:00.000Z";
    vi.mocked(getOpenRouterRankings).mockResolvedValue({ tokenUsageRankings: orRows, fetchedAt } as never);
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue({ data: t2iRows, fetchedAt } as never);
    vi.mocked(getModels).mockResolvedValue({ data: hfRows, fetchedAt } as never);

    const { ctx } = testCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.orRankings?.tokenUsageRankings).toEqual(orRows.slice(0, 5));
    expect(data.textToImage?.data).toEqual(t2iRows.slice(0, 8));
    // The donut histograms every row, so only the columns are dropped.
    expect(data.opensource?.data).toHaveLength(hfRows.length);
    expect(data.opensource?.data[0]).toEqual({ id: "org/model-0", downloads: 1_000_000, task: "text-generation" });
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

  it("surfaces a caller abort instead of cooling the whole dashboard down", async () => {
    vi.mocked(getOpenRouterRankings).mockRejectedValue(new ClientAbortError("caller gone"));
    vi.mocked(getModels).mockRejectedValue(new ClientAbortError("caller gone"));
    vi.mocked(getTextToImageLeaderboard).mockRejectedValue(new ClientAbortError("caller gone"));
    const { ctx } = testCtx();

    await expect(getHomeDashboard(ctx)).rejects.toBeInstanceOf(ClientAbortError);

    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue(textToImagePayload());
    await expect(getHomeDashboard(ctx)).resolves.toBeTruthy();
  });
});

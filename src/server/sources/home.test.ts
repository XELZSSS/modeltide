import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService, resetModuleCachesForTests } from "@/server/infra/cache-service";
import { UpstreamError } from "@/server/infra/errors";
import type { AppContext } from "@/server/context";
import { getHomeDashboard } from "@/server/sources/home";

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
  function homeCtx(): { ctx: AppContext; kvStore: Map<string, string> } {
    const kvStore = new Map<string, string>();
    const kv = {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    } as unknown as KVNamespace;
    const ctx = {
      cache: new CacheService(kv, "v1"),
      http: {} as unknown as AppContext["http"],
      kv,
      log: () => {},
    } as unknown as AppContext;
    return { ctx, kvStore };
  }

  function mockHealthyOthers() {
    vi.mocked(getOpenRouterRankings).mockResolvedValue({
      tokenUsageRankings: [{ rank: 1, id: "a/b", name: "B", creator: "A", category: "general" }],
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(getModels).mockResolvedValue([
      {
        id: "a/b",
        author: "a",
        downloads: 1,
        likes: 1,
        license: null,
        task: null,
        createdAt: null,
        lastModified: null,
        tags: [],
      },
    ]);
  }

  it("composes the inner sources without writing an outer snapshot", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue({
      models: [],
      partial: true,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const { ctx, kvStore } = homeCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage?.models).toEqual([]);
    expect(data.orRankings?.tokenUsageRankings).toHaveLength(1);
    expect(data.opensource).toHaveLength(1);
    expect(kvStore.size).toBe(0);
  });

  it("nulls the failed leg when an inner source rejects", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockRejectedValue(new Error("t2i down"));
    const { ctx } = homeCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage).toBeNull();
    expect(data.orRankings).not.toBeNull();
  });

  it("throws when all inner sources fail", async () => {
    vi.mocked(getOpenRouterRankings).mockRejectedValue(new Error("or down"));
    vi.mocked(getModels).mockRejectedValue(new Error("hf down"));
    vi.mocked(getTextToImageLeaderboard).mockRejectedValue(new Error("t2i down"));
    const { ctx } = homeCtx();
    await expect(getHomeDashboard(ctx)).rejects.toBeInstanceOf(UpstreamError);
  });
});

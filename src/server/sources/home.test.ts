import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService, resetModuleCachesForTests } from "@/server/infra";
import { PARTIAL_FAIL_TTL_MS } from "@/shared/config";
// Short outer TTL: inner sources already cache, so the outer must not extend stale.
const HOME_OUTER_TTL_MS = 5 * 60_000;
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
vi.mock("@/server/sources/artificial-analysis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/artificial-analysis")>();
  return { ...mod, getTextToImageLeaderboard: vi.fn() };
});

import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getModels } from "@/server/sources/huggingface";
import { getTextToImageLeaderboard } from "@/server/sources/artificial-analysis";

// Home dashboard TTL regression tests: the text-to-image source resolves (never
// rejects) to an empty payload on failure, so the combined dashboard must treat
// an empty T2I payload as partial degradation. Otherwise one transient blip is
// cached for the full 30-minute TTL and the homepage KPI shows no data.
describe("getHomeDashboard text-to-image degradation", () => {
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

  function envelopeTtlMs(kvStore: Map<string, string>): number {
    const envelope = JSON.parse([...kvStore.values()][0]!) as { e: number };
    return envelope.e - Date.now();
  }

  it("uses the short partial TTL when text-to-image resolves empty", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue({
      models: [],
      partial: true,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const { ctx, kvStore } = homeCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage?.models).toEqual([]);
    expect(envelopeTtlMs(kvStore)).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS + 1000);
  });

  it("uses the full outer TTL when all sources are healthy", async () => {
    mockHealthyOthers();
    vi.mocked(getTextToImageLeaderboard).mockResolvedValue({
      models: [
        {
          id: "t2i-1",
          slug: "flux",
          name: "FLUX",
          rank: 1,
          elo: 1100,
          eloLower: 1090,
          eloUpper: 1110,
          appearances: 12,
          winRate: 0.5,
          pricePer1kImages: 0.025,
          creatorName: "BFL",
        },
      ],
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const { ctx, kvStore } = homeCtx();
    const data = await getHomeDashboard(ctx);
    expect(data.textToImage?.models).toHaveLength(1);
    expect(envelopeTtlMs(kvStore)).toBeLessThanOrEqual(HOME_OUTER_TTL_MS + 1000);
  });
});

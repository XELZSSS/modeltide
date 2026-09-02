import { DEFAULT_TTL_MS, NEWS_TTL_MS, cacheKeys, API_DOMAINS } from "@/shared/config";
import type { AppContext } from "@/server/context";
import type { DataSource } from "@/server/core/data-source";
import { globalRegistry } from "@/server/domain/registry";
import { getIntelligenceIndex } from "@/server/sources/artificial-analysis";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getNews } from "@/server/sources/news";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getHomeDashboard } from "@/server/sources/home";
import type { NewsCategory } from "@/shared/types";

function ds<T, P>(key: string, ttl: number, fn: (ctx: AppContext, p: P) => Promise<T>): DataSource<T, P> {
  return {
    key,
    defaultTtl: ttl,
    fetch: async (ctx, params) => ({ data: await fn(ctx, params) }),
  };
}

export function registerAllSources(): void {
  globalRegistry
    .register(ds(API_DOMAINS.artificialIndex, DEFAULT_TTL_MS, (ctx) => getIntelligenceIndex(ctx)))
    .register(ds(API_DOMAINS.openSourceReleases, DEFAULT_TTL_MS, (ctx) => getReleases(ctx)))
    .register(ds(API_DOMAINS.openRouterRankings, DEFAULT_TTL_MS, (ctx) => getOpenRouterRankings(ctx)))
    .register(ds(API_DOMAINS.homeDashboard, DEFAULT_TTL_MS, (ctx) => getHomeDashboard(ctx)))
    .register({
      key: API_DOMAINS.news,
      defaultTtl: NEWS_TTL_MS,
      fetch: async (ctx, params: { category: NewsCategory }) => ({ data: await getNews(ctx, params.category) }),
    })
    .register({
      key: API_DOMAINS.openSourceModels,
      defaultTtl: DEFAULT_TTL_MS,
      fetch: async (ctx, params: { sort: string; direction: string; limit: number }) => ({ data: await getModels(ctx, params) }),
    })
    .register(
      ds(cacheKeys.textToImage, DEFAULT_TTL_MS, async (ctx) => {
        const { getTextToImageLeaderboard } = await import("@/server/sources/artificial-analysis");
        return getTextToImageLeaderboard(ctx) as unknown as never;
      }),
    );
}

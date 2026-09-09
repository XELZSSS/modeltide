import { normalizeModelLimit } from "@/shared/config/limits";
import { cacheKey } from "@/shared/config/paths";
import type { NewsCategory } from "@/shared/types/news";

export const cacheKeys = {
  intelligenceIndex: cacheKey("artificialIndex"),
  homeDashboard: cacheKey("homeDashboard"),
  openSourceModels: (sort: string, direction: string, limit: number) =>
    cacheKey("openSourceModels", sort, direction, normalizeModelLimit(limit)),
  openSourceModel: (id: string) => cacheKey("openSourceModels", "by-id", id),
  openSourceReleases: cacheKey("openSourceReleases"),
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: "openrouter-pricing-map:per-million",
  closedReleases: cacheKey("closedReleases"),
  agentRankings: cacheKey("agentRankings"),
  officialPricing: cacheKey("officialPricing"),
  statusHistoryPayload: cacheKey("statusHistory", "payload"),
  textToImage: "aa-text-to-image",
  changelog: "aa-changelog",
} as const;

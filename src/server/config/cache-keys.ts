import { API_DOMAINS } from "@/shared/config/paths";
import { normalizeModelLimit } from "@/shared/config/limits";
import type { NewsCategory } from "@/shared/types/news";

export const cacheKeys = {
  intelligenceIndex: API_DOMAINS.artificialIndex,
  openSourceModels: (sort: string, direction: string, limit: number) =>
    `${API_DOMAINS.openSourceModels}:${sort}:${direction}:${normalizeModelLimit(limit)}`,
  openSourceReleases: API_DOMAINS.openSourceReleases,
  news: (category: NewsCategory) => `${API_DOMAINS.news}:${category}`,
  openRouterRankings: API_DOMAINS.openRouterRankings,
  openRouterPricing: "openrouter-pricing-map:per-million",
  closedReleases: API_DOMAINS.closedReleases,
  arenaBoard: (category: string) => `${API_DOMAINS.arenaBoard}:${category}`,
  arenaRankings: API_DOMAINS.arenaRankings,
  officialPricing: API_DOMAINS.officialPricing,
  textToImage: "aa-text-to-image",
  changelog: "aa-changelog",
  providerStatus: "provider-status",
} as const;

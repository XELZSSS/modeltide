import type { NewsCategory } from "@/shared/types/news";
import { normalizeModelLimit, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";

export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  openRouterPricing: "openrouter-pricing-map",
  closedReleases: "closed-releases",
  arenaBoard: "arena-board",
  arenaRankings: "arena-rankings",
  officialPricing: "official-pricing",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
  textToImage: "aa-text-to-image",
  changelog: "aa-changelog",
  providerStatus: "provider-status",
} as const;

export const apiPaths = {
  artificialIndex: `/api/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `/api/${API_DOMAINS.openSourceModels}`,
  openSourceReleases: `/api/${API_DOMAINS.openSourceReleases}`,
  news: `/api/${API_DOMAINS.news}`,
  openRouterRankings: `/api/${API_DOMAINS.openRouterRankings}`,
  closedReleases: `/api/${API_DOMAINS.closedReleases}`,
  arenaBoard: `/api/${API_DOMAINS.arenaBoard}`,
  arenaRankings: `/api/${API_DOMAINS.arenaRankings}`,
  officialPricing: `/api/${API_DOMAINS.officialPricing}`,
  statusHistory: `/api/${API_DOMAINS.statusHistory}`,
  homeDashboard: `/api/${API_DOMAINS.homeDashboard}`,
} as const;

export const cacheKeys = {
  intelligenceIndex: API_DOMAINS.artificialIndex,
  openSourceModels: (sort: string, direction: string, limit: number) =>
    `${API_DOMAINS.openSourceModels}:${sort}:${direction}:${normalizeModelLimit(limit)}`,
  openSourceReleases: API_DOMAINS.openSourceReleases,
  news: (category: NewsCategory) => `${API_DOMAINS.news}:${category}`,
  openRouterRankings: API_DOMAINS.openRouterRankings,
  openRouterPricing: API_DOMAINS.openRouterPricing,
  closedReleases: API_DOMAINS.closedReleases,
  arenaBoard: (category: string) => `${API_DOMAINS.arenaBoard}:${category}`,
  arenaRankings: API_DOMAINS.arenaRankings,
  officialPricing: API_DOMAINS.officialPricing,
  textToImage: API_DOMAINS.textToImage,
  changelog: API_DOMAINS.changelog,
  providerStatus: API_DOMAINS.providerStatus,
  homeDashboard: API_DOMAINS.homeDashboard,
} as const;

export const clientApiPaths = {
  artificialIndex: apiPaths.artificialIndex,
  openSourceModels: (() => {
    const d = OPEN_SOURCE_MODELS_DEFAULTS;
    return `${apiPaths.openSourceModels}?sort=${d.sort}&direction=${d.direction}&limit=${d.limit}`;
  })(),
  openSourceReleases: apiPaths.openSourceReleases,
  openRouterRankings: apiPaths.openRouterRankings,
  closedReleases: apiPaths.closedReleases,
  arenaBoard: (category: string) => `${apiPaths.arenaBoard}?category=${encodeURIComponent(category)}`,
  arenaRankings: apiPaths.arenaRankings,
  officialPricing: apiPaths.officialPricing,
  statusHistory: apiPaths.statusHistory,
  news: (category: string) => `${apiPaths.news}?category=${encodeURIComponent(category)}`,
  homeDashboard: apiPaths.homeDashboard,
} as const;

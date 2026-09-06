import { API_DOMAINS, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";

export const queryKeys = {
  artificialIndex: ["api", API_DOMAINS.artificialIndex] as const,
  openSourceReleases: ["api", API_DOMAINS.openSourceReleases] as const,
  openRouterRankings: ["api", API_DOMAINS.openRouterRankings] as const,
  homeDashboard: ["api", API_DOMAINS.homeDashboard] as const,
  openSourceModels: [
    "api",
    API_DOMAINS.openSourceModels,
    OPEN_SOURCE_MODELS_DEFAULTS.sort,
    OPEN_SOURCE_MODELS_DEFAULTS.direction,
    OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ] as const,
  statusHistory: ["api", API_DOMAINS.statusHistory] as const,
  news: (category: string) => ["api", API_DOMAINS.news, category] as const,
  arenaBoard: (category: string) => ["api", API_DOMAINS.arenaBoard, category] as const,
  arenaRankings: ["api", API_DOMAINS.arenaRankings] as const,
  officialPricing: ["api", API_DOMAINS.officialPricing] as const,
  closedReleases: ["api", API_DOMAINS.closedReleases] as const,
};

import { OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";

export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceModel: "open-source-model",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  closedReleases: "closed-releases",
  agentRankings: "agent-rankings",
  officialPricing: "official-pricing",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export function apiPath(domain: keyof typeof API_DOMAINS): string {
  return `/api/${API_DOMAINS[domain]}`;
}

export function cacheKey(domain: keyof typeof API_DOMAINS, ...parts: (string | number)[]): string {
  return [API_DOMAINS[domain], ...parts].join(":");
}

export function queryKey(domain: keyof typeof API_DOMAINS, ...parts: (string | number)[]): readonly string[] {
  return ["api", "v2", API_DOMAINS[domain], ...parts.map(String)] as const;
}

export const queryKeys = {
  artificialIndex: queryKey("artificialIndex"),
  openSourceReleases: queryKey("openSourceReleases"),
  openRouterRankings: queryKey("openRouterRankings"),
  homeDashboard: queryKey("homeDashboard"),
  openSourceModels: queryKey(
    "openSourceModels",
    OPEN_SOURCE_MODELS_DEFAULTS.sort,
    OPEN_SOURCE_MODELS_DEFAULTS.direction,
    OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ),
  openSourceModel: (id: string) => queryKey("openSourceModel", id),
  statusHistory: queryKey("statusHistory"),
  news: (category: string) => queryKey("news", category),
  agentRankings: queryKey("agentRankings"),
  officialPricing: queryKey("officialPricing"),
  closedReleases: queryKey("closedReleases"),
} as const;

export const apiPaths = {
  artificialIndex: apiPath("artificialIndex"),
  openSourceModels: apiPath("openSourceModels"),
  openSourceModel: apiPath("openSourceModel"),
  openSourceReleases: apiPath("openSourceReleases"),
  news: apiPath("news"),
  openRouterRankings: apiPath("openRouterRankings"),
  closedReleases: apiPath("closedReleases"),
  agentRankings: apiPath("agentRankings"),
  officialPricing: apiPath("officialPricing"),
  statusHistory: apiPath("statusHistory"),
  homeDashboard: apiPath("homeDashboard"),
} as const;

export const publicApiPaths = {
  artificialIndex: apiPaths.artificialIndex,
  openSourceModels: (() => {
    const d = OPEN_SOURCE_MODELS_DEFAULTS;
    return `${apiPaths.openSourceModels}?sort=${d.sort}&direction=${d.direction}&limit=${d.limit}`;
  })(),
  openSourceModel: (id: string) => `${apiPaths.openSourceModel}?id=${encodeURIComponent(id)}`,
  openSourceReleases: apiPaths.openSourceReleases,
  openRouterRankings: apiPaths.openRouterRankings,
  closedReleases: apiPaths.closedReleases,
  agentRankings: apiPaths.agentRankings,
  officialPricing: apiPaths.officialPricing,
  statusHistory: apiPaths.statusHistory,
  news: (category: string) => `${apiPaths.news}?category=${encodeURIComponent(category)}`,
  homeDashboard: apiPaths.homeDashboard,
} as const;

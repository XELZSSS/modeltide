import { OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";

export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceModel: "open-source-model",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  closedReleases: "closed-releases",
  agentRankings: "agent-rankings",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export const API_PREFIX = "/api";

export const API_VERSION_PARAM = "v";

export type ApiDomain = keyof typeof API_DOMAINS;

const QUERY_KEY_PREFIX = ["api", "v2"] as const;

export function cacheKey(domain: ApiDomain, ...parts: (string | number)[]): string {
  return [API_DOMAINS[domain], ...parts].join(":");
}

export const queryKeys = {
  artificialIndex: [...QUERY_KEY_PREFIX, API_DOMAINS.artificialIndex],
  openSourceModels: [
    ...QUERY_KEY_PREFIX,
    API_DOMAINS.openSourceModels,
    OPEN_SOURCE_MODELS_DEFAULTS.sort,
    OPEN_SOURCE_MODELS_DEFAULTS.direction,
    String(OPEN_SOURCE_MODELS_DEFAULTS.limit),
  ],
  openSourceModel: (id: string) => [...QUERY_KEY_PREFIX, API_DOMAINS.openSourceModel, id],
  news: (category: string) => [...QUERY_KEY_PREFIX, API_DOMAINS.news, category],
  openRouterRankings: [...QUERY_KEY_PREFIX, API_DOMAINS.openRouterRankings],
  closedReleases: [...QUERY_KEY_PREFIX, API_DOMAINS.closedReleases],
  agentRankings: [...QUERY_KEY_PREFIX, API_DOMAINS.agentRankings],
  statusHistory: [...QUERY_KEY_PREFIX, API_DOMAINS.statusHistory],
  homeDashboard: [...QUERY_KEY_PREFIX, API_DOMAINS.homeDashboard],
} as const;

export const apiPaths = {
  artificialIndex: `${API_PREFIX}/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `${API_PREFIX}/${API_DOMAINS.openSourceModels}`,
  openSourceModel: `${API_PREFIX}/${API_DOMAINS.openSourceModel}`,
  news: `${API_PREFIX}/${API_DOMAINS.news}`,
  openRouterRankings: `${API_PREFIX}/${API_DOMAINS.openRouterRankings}`,
  closedReleases: `${API_PREFIX}/${API_DOMAINS.closedReleases}`,
  agentRankings: `${API_PREFIX}/${API_DOMAINS.agentRankings}`,
  statusHistory: `${API_PREFIX}/${API_DOMAINS.statusHistory}`,
  homeDashboard: `${API_PREFIX}/${API_DOMAINS.homeDashboard}`,
} as const satisfies Record<ApiDomain, string>;

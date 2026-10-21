export const MAX_ID_CHARS = 500;
export const MAX_NAME_CHARS = 200;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
} as const;

const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  closedReleases: "closed-releases",
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
  // Keyed by sort (and by id for single-model lookups) so the react-query key can never
  // diverge from the requested URL.
  openSourceModels: (sort: string, id = "") => [...QUERY_KEY_PREFIX, API_DOMAINS.openSourceModels, sort, id],
  news: [...QUERY_KEY_PREFIX, API_DOMAINS.news],
  openRouterRankings: [...QUERY_KEY_PREFIX, API_DOMAINS.openRouterRankings],
  closedReleases: [...QUERY_KEY_PREFIX, API_DOMAINS.closedReleases],
  homeDashboard: [...QUERY_KEY_PREFIX, API_DOMAINS.homeDashboard],
} as const satisfies Record<ApiDomain, unknown>;

export const apiPaths = {
  artificialIndex: `${API_PREFIX}/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `${API_PREFIX}/${API_DOMAINS.openSourceModels}`,
  news: `${API_PREFIX}/${API_DOMAINS.news}`,
  openRouterRankings: `${API_PREFIX}/${API_DOMAINS.openRouterRankings}`,
  closedReleases: `${API_PREFIX}/${API_DOMAINS.closedReleases}`,
  homeDashboard: `${API_PREFIX}/${API_DOMAINS.homeDashboard}`,
} as const satisfies Record<ApiDomain, string>;

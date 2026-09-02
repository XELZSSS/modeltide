// NOTE: the client re-exports its own query-string builders under the same
// `apiPaths` name (see src/client/api/client.ts) with a different shape
// (news is a function there). Import the shared map as `baseApiPaths` on the
// client to avoid mixing the two. API_DOMAINS doubles as the KV key namespace;
// "openRouterPricing" is cache-only (no route serves it).
export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  openRouterPricing: "openrouter-pricing-map",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export const apiPaths = {
  artificialIndex: `/api/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `/api/${API_DOMAINS.openSourceModels}`,
  openSourceReleases: `/api/${API_DOMAINS.openSourceReleases}`,
  news: `/api/${API_DOMAINS.news}`,
  openRouterRankings: `/api/${API_DOMAINS.openRouterRankings}`,
  statusHistory: `/api/${API_DOMAINS.statusHistory}`,
  homeDashboard: `/api/${API_DOMAINS.homeDashboard}`,
} as const;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 500,
} as const;

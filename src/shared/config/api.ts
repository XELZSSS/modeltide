export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  openRouterPricing: "openrouter-pricing-map",
  sourcesStatus: "sources-status",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export const apiPaths = {
  artificialIndex: `/api/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `/api/${API_DOMAINS.openSourceModels}`,
  openSourceReleases: `/api/${API_DOMAINS.openSourceReleases}`,
  news: `/api/${API_DOMAINS.news}`,
  openRouterRankings: `/api/${API_DOMAINS.openRouterRankings}`,
  sourcesStatus: `/api/${API_DOMAINS.sourcesStatus}`,
  statusHistory: `/api/${API_DOMAINS.statusHistory}`,
  homeDashboard: `/api/${API_DOMAINS.homeDashboard}`,
} as const;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 500,
} as const;

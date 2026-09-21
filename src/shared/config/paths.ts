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

type Domain = keyof typeof API_DOMAINS;
const DOMAINS = Object.keys(API_DOMAINS) as Domain[];

function apiPath(domain: Domain): string {
  return `/api/${API_DOMAINS[domain]}`;
}

export function cacheKey(domain: Domain, ...parts: (string | number)[]): string {
  return [API_DOMAINS[domain], ...parts].join(":");
}

function queryKey(domain: Domain, ...parts: (string | number)[]): readonly string[] {
  return ["api", "v2", API_DOMAINS[domain], ...parts.map(String)] as const;
}

// Every domain gets a plain `["api","v2",<slug>]` key for free; only the
// entries below need extra segments or parameterization.
const plainQueryKeys = Object.fromEntries(DOMAINS.map((d) => [d, queryKey(d)])) as Record<Domain, readonly string[]>;

export const queryKeys = {
  ...plainQueryKeys,
  openSourceModels: queryKey(
    "openSourceModels",
    OPEN_SOURCE_MODELS_DEFAULTS.sort,
    OPEN_SOURCE_MODELS_DEFAULTS.direction,
    OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ),
  openSourceModel: (id: string) => queryKey("openSourceModel", id),
  news: (category: string) => queryKey("news", category),
} as const;

export const apiPaths = Object.fromEntries(DOMAINS.map((d) => [d, apiPath(d)])) as Record<Domain, string>;

// Plain paths for free; only URLs that carry query strings are overridden.
export const publicApiPaths = {
  ...apiPaths,
  openSourceModels: (() => {
    const d = OPEN_SOURCE_MODELS_DEFAULTS;
    return `${apiPaths.openSourceModels}?sort=${d.sort}&direction=${d.direction}&limit=${d.limit}`;
  })(),
  openSourceModel: (id: string) => `${apiPaths.openSourceModel}?id=${encodeURIComponent(id)}`,
  news: (category: string) => `${apiPaths.news}?category=${encodeURIComponent(category)}`,
} as const;

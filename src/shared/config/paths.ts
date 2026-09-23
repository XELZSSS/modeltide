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
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export const API_PREFIX = "/api";

export const API_VERSION_PARAM = "v";

type Domain = keyof typeof API_DOMAINS;
const DOMAINS = Object.keys(API_DOMAINS) as Domain[];

function apiPath(domain: Domain): string {
  return `${API_PREFIX}/${API_DOMAINS[domain]}`;
}

export function cacheKey(domain: Domain, ...parts: (string | number)[]): string {
  return [API_DOMAINS[domain], ...parts].join(":");
}

function queryKey(domain: Domain, ...parts: (string | number)[]): readonly string[] {
  return ["api", "v2", API_DOMAINS[domain], ...parts.map(String)] as const;
}

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

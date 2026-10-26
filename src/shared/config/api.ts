import { OPEN_SOURCE_SORTS } from "../query-schemas.ts";

export const MAX_ID_CHARS = 500;
export const MAX_NAME_CHARS = 200;

// Hugging Face model ids are `owner/name` with at most 96 characters on either side (see HF_MODEL_ID_RE in
// src/server/huggingface/source.ts); the API rejects longer ids instead of guessing at a truncation.
export const MAX_MODEL_ID_CHARS = 195;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: OPEN_SOURCE_SORTS[0],
} as const;

const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  closedReleases: "closed-releases",
  homeDashboard: "home-dashboard",
  decisionIndex: "decision-index",
} as const;

export const API_PREFIX = "/api";

export const API_VERSION_PARAM = "v";

export type ApiDomain = keyof typeof API_DOMAINS;

const QUERY_KEY_PREFIX = ["api"] as const;

export function cacheKey(domain: ApiDomain, ...parts: (string | number)[]): string {
  return [API_DOMAINS[domain], ...parts].join(":");
}

export const queryKeys = {
  artificialIndex: [...QUERY_KEY_PREFIX, API_DOMAINS.artificialIndex],
  openSourceModels: (sort: string, id = "") => [...QUERY_KEY_PREFIX, API_DOMAINS.openSourceModels, sort, id],
  news: (category: string) => [...QUERY_KEY_PREFIX, API_DOMAINS.news, category],
  openRouterRankings: [...QUERY_KEY_PREFIX, API_DOMAINS.openRouterRankings],
  closedReleases: [...QUERY_KEY_PREFIX, API_DOMAINS.closedReleases],
  homeDashboard: [...QUERY_KEY_PREFIX, API_DOMAINS.homeDashboard],
  decisionIndex: [...QUERY_KEY_PREFIX, API_DOMAINS.decisionIndex],
} as const satisfies Record<ApiDomain, unknown>;

export const apiPaths = {
  artificialIndex: `${API_PREFIX}/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `${API_PREFIX}/${API_DOMAINS.openSourceModels}`,
  news: `${API_PREFIX}/${API_DOMAINS.news}`,
  openRouterRankings: `${API_PREFIX}/${API_DOMAINS.openRouterRankings}`,
  closedReleases: `${API_PREFIX}/${API_DOMAINS.closedReleases}`,
  homeDashboard: `${API_PREFIX}/${API_DOMAINS.homeDashboard}`,
  decisionIndex: `${API_PREFIX}/${API_DOMAINS.decisionIndex}`,
} as const satisfies Record<ApiDomain, string>;

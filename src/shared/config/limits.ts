export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

export const MAX_MODEL_LIMIT = 500;

export const UPTIME_WARN_RATIO = 0.995;
export const UPTIME_ERROR_RATIO = 0.95;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 200,
} as const;

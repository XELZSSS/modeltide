export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
  cost: "cost-store",
} as const;

export const SETTINGS_STORAGE_VERSION = 1;

export const MAX_MODEL_LIMIT = 500;

export const MAX_ID_CHARS = 500;
export const MAX_NAME_CHARS = 200;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 200,
} as const;

export const CACHE_VERSION = "v1";

export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const MAX_MODEL_LIMIT = 500;

export function normalizeModelLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 50) return 50;
  if (limit <= 100) return 100;
  return MAX_MODEL_LIMIT;
}

export function sliceToLimit<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_MODEL_LIMIT)));
}

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 500,
} as const;

export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = THIRTY_MINUTES;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = FIVE_MINUTES;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  return partial ? PARTIAL_FAIL_TTL_MS : normalTtl;
}

export function ttlForRatio(failed: number, total: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(total > 0 && failed * 2 >= total, normalTtl);
}

export const MEMORY_CACHE_MAX_KEYS = 200;
export const MEMORY_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const MEMORY_RATE_MAX_KEYS = 2000;
export const MEMORY_RATE_PRUNE_TO = 1500;
export const L1_MAX_TTL_MS = 60_000;

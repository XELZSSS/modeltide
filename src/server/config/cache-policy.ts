export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const MEMORY_CACHE_MAX_KEYS = 200;
export const MEMORY_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const MEMORY_RATE_MAX_KEYS = 2000;
export const MEMORY_RATE_PRUNE_TO = 1500;
export const L1_MAX_TTL_MS = 60_000;

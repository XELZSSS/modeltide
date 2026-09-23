export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const MEMORY_CACHE_MAX_KEYS = 200;
export const MEMORY_CACHE_MAX_BYTES = 32 * 1024 * 1024;
/** Fallback L1 TTL when the effective TTL is missing/invalid. */
export const L1_MAX_TTL_MS = 60_000;
/** Cap for L1 residency regardless of origin TTL (STATIC 6h stays 15min in L1). */
export const L1_TTL_CAP_MS = 15 * 60_000;

export const MAX_KV_RETENTION_TTL_S = 30 * 24 * 60 * 60;

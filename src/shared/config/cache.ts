import type { NewsCategory } from "@/shared/types";
import { API_DOMAINS } from "./api";

// Bump manually when a cached payload shape changes; old envelopes live until
// their hard expiry (ttl + STALE_WINDOW), so list touched payloads in the bump
// commit (StatusHistoryPayload, OpenRouterRankingsPayload, ...).
export const CACHE_VERSION = "v2";

/** Largest page the open-source endpoints will serve (also the top normalize bucket). */
export const MAX_MODEL_LIMIT = 500;

/**
 * Cache layering: browser (BROWSER_*) → CDN (CDN_*, stale-if-error=1 day) → KV
 * (DEFAULT_TTL_MS in ttl.ts, stale payload fallback in infra/cache.ts).
 */
export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

/** Snap arbitrary limits to a small set so the cache key space stays bounded. */
export function normalizeModelLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 50) return 50;
  if (limit <= 100) return 100;
  return MAX_MODEL_LIMIT;
}

/** Trim a fetched bucket back to the requested limit (?limit=101 fetches 500, serves 101). */
export function sliceToLimit<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_MODEL_LIMIT)));
}

export const cacheKeys = {
  intelligenceIndex: API_DOMAINS.artificialIndex,
  openSourceModels: (sort: string, direction: string, limit: number) =>
    `${API_DOMAINS.openSourceModels}:${sort}:${direction}:${normalizeModelLimit(limit)}`,
  openSourceReleases: API_DOMAINS.openSourceReleases,
  news: (category: NewsCategory) => `${API_DOMAINS.news}:${category}`,
  openRouterRankings: API_DOMAINS.openRouterRankings,
  openRouterPricing: API_DOMAINS.openRouterPricing,
  textToImage: "aa-text-to-image",
  homeDashboard: API_DOMAINS.homeDashboard,
} as const;

import type { NewsCategory } from "@/shared/types";
import { API_DOMAINS } from "./api";

export const CACHE_VERSION = "v1";

/**
 * Cache layering: browser (BROWSER_*) → CDN (CDN_*, stale-if-error=1 day) → KV
 * (DEFAULT_TTL_MS in ttl.ts, stale payload fallback in infra/cache.ts).
 */
export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const cacheKeys = {
  intelligenceIndex: API_DOMAINS.artificialIndex,
  openSourceModels: (sort: string, direction: string, limit: number) =>
    `${API_DOMAINS.openSourceModels}:${sort}:${direction}:${limit}`,
  openSourceReleases: API_DOMAINS.openSourceReleases,
  news: (category: NewsCategory) => `${API_DOMAINS.news}:${category}`,
  openRouterRankings: API_DOMAINS.openRouterRankings,
  openRouterPricing: API_DOMAINS.openRouterPricing,
  textToImage: "aa-text-to-image",
} as const;

/**
 * Cache version (hard cut): `CACHE_VERSION` prefixes every cache key and is
 * GENERATED from a content hash over all payload-shape-defining code (see
 * scripts/gen-cache-version.cjs). Any change to that code flips the version
 * on the next build — an ABI break where payloads under the old prefix are
 * never read, rewritten, or migrated; they simply expire unused (≤30d KV
 * retention). A generation flip costs one cold fetch per key instead of
 * permanent migration code. No legacy-read or adoption machinery exists by
 * design, and there is no manual version to bump.
 */

export { CACHE_VERSION } from "./cache-version.gen";

export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

export const MAX_MODEL_LIMIT = 500;

/**
 * Fetch caps per content. Policy:
 * - Full (no cap): lists backing detail pages, search and matching
 *   (AA index, OpenRouter rankings/directory, text-to-image, official
 *   pricing, weights). Truncating those loses content.
 * - Windowed: unbounded upstreams where only a recent head is served
 *   (HF models/releases, changelogs). Detail long-tails resolve on demand.
 * - Display-capped: pure rankings/news views with no downstream lookups.
 */
export const SOURCE_LIMITS = {
  openSourceModels: 200,
  openSourceReleases: 200,
  changelog: 200,
  closedReleases: 200,
  agentRankings: 100,
  newsPerCategory: 30,
  dailyPapers: 20,
  /** Guaranteed seats for HF daily papers at the head of the research feed. */
  hfPapersQuota: 5,
  feedItemsPerFeed: 30,
} as const;

export const PER_MILLION = 1_000_000;

export const MAX_PLAUSIBLE_RATE = 1000;

export function normalizeModelLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 50) return 50;
  if (limit <= 100) return 100;
  if (limit <= 200) return 200;
  return MAX_MODEL_LIMIT;
}

export function sliceToLimit<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_MODEL_LIMIT)));
}

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: SOURCE_LIMITS.openSourceModels,
} as const;

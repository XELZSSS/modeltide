import { ONE_MINUTE } from "@/shared/config/time";
import type { Logger } from "@/server/api/logger";
import { throttleGate } from "@/server/util/throttle";

/**
 * Per-isolate counters for the cache path: without them a regression that turns L1 hits into KV reads only surfaces as
 * latency in production. Logging is gated to one line per window.
 */
const STATS_LOG_INTERVAL_MS = 30 * ONE_MINUTE;

const statsLogGate = throttleGate(STATS_LOG_INTERVAL_MS);

const ZERO_STATS = {
  l1Hits: 0,
  kvHits: 0,
  cacheMisses: 0,
  staleServed: 0,
  refreshes: 0,
  kvReads: 0,
  kvReadsCoalesced: 0,
  kvWrites: 0,
  kvReadFailures: 0,
} satisfies Record<string, number>;

type CacheStats = Record<keyof typeof ZERO_STATS, number>;

const cacheStats: CacheStats = { ...ZERO_STATS };

const STAT_KEYS = Object.keys(ZERO_STATS) as (keyof CacheStats)[];

export function resetCacheStats(): void {
  Object.assign(cacheStats, ZERO_STATS);
}

// `by` is always one: every caller records a single event, so a delta parameter was a knob no caller ever turned.
export function noteCacheStat(key: keyof CacheStats): void {
  cacheStats[key] += 1;
}

/**
 * Emits one aggregate line each time the 30-minute gate opens, then clears the counters; while it is closed they keep
 * accumulating, so a line covers at least one interval.
 */
export function flushCacheStats(log: Logger): void {
  if (!statsLogGate.open()) return;
  let total = 0;
  for (const key of STAT_KEYS) total += cacheStats[key];
  if (total === 0) return;
  log("info", "[cache] window", { ...cacheStats });
  resetCacheStats();
}

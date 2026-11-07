export const SOURCE_LIMITS = {
  newsPerCategory: 30,
  feedItemsPerFeed: 30,
} as const;

export const PER_MILLION = 1_000_000;
export const MAX_DIRECTORY_ROWS = 20_000;
/** Row ceiling for a usage-rankings payload: one row per (model, variant) before the aggregation groups them. */
export const MAX_RANKING_ROWS = 20_000;
export const MAX_LEADERBOARD_ROWS = 5_000;
/** Row ceiling for the CursorBench leaderboard, which is scraped from one HTML table. */
export const MAX_CURSORBENCH_ROWS = 500;

export function perMillionOrNull(rate: number | null): number | null {
  return rate == null ? null : rate * PER_MILLION;
}

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
/** The ceiling for a page read as text (CursorBench is scraped as HTML), kept apart from the JSON cap it replaced. */
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
export const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;

/** A publisher's own article URL, bounded so an unbounded one cannot land in logs, cache keys or the payload. */
export const MAX_LINK_CHARS = 2048;

export const MAX_SCAN_CHARS = 8_000_000;
export const STREAM_LINE_RE = /^[0-9a-fA-F]{1,8}:(.*)$/s;
export const MAX_NEEDLE_WORK_CHARS = 64 * 1024 * 1024;
export const MAX_NEEDLE_CANDIDATES = 256;

export type RscExtractor<T> = (data: unknown, marker: string) => T[] | null;

export const SOURCE_LIMITS = {
  newsPerCategory: 30,
  feedItemsPerFeed: 30,
} as const;

export const PER_MILLION = 1_000_000;
export const MAX_DIRECTORY_ROWS = 20_000;
export const MAX_LEADERBOARD_ROWS = 5_000;

export function perMillionOrNull(rate: number | null): number | null {
  return rate == null ? null : rate * PER_MILLION;
}

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
export const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;
export const MAX_SCAN_CHARS = 8_000_000;
export const STREAM_LINE_RE = /^[0-9a-fA-F]{1,8}:(.*)$/s;
export const MAX_NEEDLE_WORK_CHARS = 64 * 1024 * 1024;
export const MAX_NEEDLE_CANDIDATES = 256;

export type RscExtractor<T> = (data: unknown, marker: string) => T[] | null;

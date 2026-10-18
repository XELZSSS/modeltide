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

// Shared by the upstream client and the pure parsers: neither may import the other's config.
export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

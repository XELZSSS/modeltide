export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

// Read ceilings. A tier's warm call reuses whatever is still fresh, so a ceiling
// decides that tier's real refresh period: the jittered TTL (0.95–1.0×) keeps a
// ceiling equal to the check interval just under it, which is what makes the
// 30-min grid and the hourly grid refresh on every check. Raising a ceiling
// above its check interval skips checks (SLOW_TTL_MS, checked hourly, refetches
// every other hour by design).
export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = ONE_HOUR;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = FIVE_MINUTES;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  if (!partial) return normalTtl;
  return Math.min(PARTIAL_FAIL_TTL_MS, Math.max(60_000, Math.floor(normalTtl / 6)));
}

export function ttlForRatio(failed: number, total: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(total > 0 && failed * 10 >= total * 3, normalTtl);
}

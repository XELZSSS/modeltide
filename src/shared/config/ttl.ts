export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = THIRTY_MINUTES;
export const PARTIAL_FAIL_TTL_MS = ONE_MINUTE;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  return partial ? PARTIAL_FAIL_TTL_MS : normalTtl;
}
/** Shorthand for multi-feed sources: any feed failure shortens the TTL. */
export function ttlForCount(failCount: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(failCount > 0, normalTtl);
}

// News warm window derived from the TTL: refresh inside the last WARM_SPAN minutes
// before expiry. A fixed 28/4 split drifted when the cron tick slipped; deriving it
// from NEWS_TTL_MS keeps the window aligned if the TTL is ever retuned.
const NEWS_WARM_SPAN_MINUTES = 4;

export function newsWarmDue(utcMinutes: number = new Date().getUTCMinutes()): boolean {
  const intervalMinutes = Math.max(NEWS_TTL_MS / ONE_MINUTE - 2, NEWS_WARM_SPAN_MINUTES + 1);
  return utcMinutes % intervalMinutes < NEWS_WARM_SPAN_MINUTES;
}

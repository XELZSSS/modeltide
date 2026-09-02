export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

export const DEFAULT_TTL_MS = FIFTEEN_MINUTES;
export const NEWS_TTL_MS = THIRTY_MINUTES;
export const PARTIAL_FAIL_TTL_MS = ONE_MINUTE;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  return partial ? PARTIAL_FAIL_TTL_MS : normalTtl;
}
export function ttlForCount(failCount: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return failCount > 0 ? PARTIAL_FAIL_TTL_MS : normalTtl;
}

const NEWS_WARM_INTERVAL_MINUTES = 28;
const NEWS_WARM_SPAN_MINUTES = 4;

export function newsWarmDue(utcMinutes: number = new Date().getUTCMinutes()): boolean {
  return utcMinutes % NEWS_WARM_INTERVAL_MINUTES < NEWS_WARM_SPAN_MINUTES;
}

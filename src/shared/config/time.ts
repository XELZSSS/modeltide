export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = ONE_HOUR;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = 10 * ONE_MINUTE;

export const STATUS_TTL_MS = 30_000;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  if (!partial) return normalTtl;
  return Math.min(normalTtl, Math.max(PARTIAL_FAIL_TTL_MS, Math.floor(normalTtl / 6)));
}

export function ttlForRatio(failed: number, total: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(total > 0 && failed * 10 >= total * 3, normalTtl);
}

const UPSTREAM_TIMEOUT_MS = 10_000;
const RSS_TIMEOUT_MS = 7_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: RSS_TIMEOUT_MS, retries: 0 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS] as const;

export const WORST_CASE_UPSTREAM_CALL_MS =
  Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const CLIENT_FETCH_TIMEOUT_MS = 15_000;

export const SHARED_REFRESH_TIMEOUT_MS = 25_000;

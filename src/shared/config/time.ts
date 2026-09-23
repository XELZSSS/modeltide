export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

// TTLs are jittered 0.95–1.0×, so a ceiling equal to its check interval stays just
// under it; a ceiling above its interval skips checks (SLOW_TTL_MS: hourly, refetches every other hour).
export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = ONE_HOUR;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = FIVE_MINUTES;

/** Status payload freshness, shared by both ends: the server's TTL and the client's staleness budget
 * have to be the same number, or a health page shows data the server has already replaced. */
export const STATUS_TTL_MS = 30_000;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  if (!partial) return normalTtl;
  return Math.min(PARTIAL_FAIL_TTL_MS, Math.max(60_000, Math.floor(normalTtl / 6)));
}

export function ttlForRatio(failed: number, total: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(total > 0 && failed * 10 >= total * 3, normalTtl);
}

const UPSTREAM_TIMEOUT_MS = 10_000;
const RSS_TIMEOUT_MS = 7_000;

/** Retry backoff ceiling used by http-client; bounds the worst-case call below. */
export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

/** News legs. No retry: the whole fan-out shares one detached-refresh deadline (SHARED_REFRESH_TIMEOUT_MS),
 * and a second attempt per leg would overrun it — losing the entire refresh its cache write. */
export const FAST_FETCH_OPTS = { timeoutMs: RSS_TIMEOUT_MS, retries: 0 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS] as const;

const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

/** Past every upstream timeout, so a stuck refresh fn is the only thing that can trip it; covers a handler
 * awaiting two such calls in sequence. Firing on a live refresh would start a second concurrent fetch. */
export const INFLIGHT_HANG_GUARD_MS = WORST_CASE_UPSTREAM_CALL_MS * 2;

/** Below the server's worst case (`INFLIGHT_HANG_GUARD_MS`) by design; a client abort is the fast-fail path. */
export const CLIENT_FETCH_TIMEOUT_MS = 15_000;

/** Total upstream budget for ONE detached API refresh; must stay under Cloudflare's 30s waitUntil window,
 * so a request-path fan-out has to FIT INSIDE it. A probe cut off this way keeps its prior state. */
export const SHARED_REFRESH_TIMEOUT_MS = 25_000;

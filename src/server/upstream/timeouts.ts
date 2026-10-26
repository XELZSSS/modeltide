// Free plan: 50 external subrequests and 6 simultaneous connections per invocation.
const UPSTREAM_TIMEOUT_MS = 12_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

/**
 * RSS/Atom feeds. One dropped feed marks its whole news category partial, so a transient failure is worth one retry —
 * with a shorter per-attempt budget than the JSON path so the worst case (2 × 10s + backoff = 22 s) still fits inside a
 * single news request, whose legs share the 6-connection pool.
 *
 * 10 s rather than the 8 s it used to carry: a feed's first, cold CDN miss measured 8.8 s (every warm request afterwards
 * finished in under 1.2 s), which an 8 s budget cut off on the first attempt and turned into a `partial` category for a
 * source that was only slow, not down. The value stays under the JSON path's worst case, so `SHARED_REFRESH_TIMEOUT_MS`
 * and the hang guard derived from it are unchanged.
 */
export const FEED_TIMEOUT_MS = 10_000;
export const FEED_FETCH_OPTS = { timeoutMs: FEED_TIMEOUT_MS, retries: 1 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FEED_FETCH_OPTS] as const;

const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

export const SHARED_REFRESH_TIMEOUT_MS = WORST_CASE_UPSTREAM_CALL_MS;

/**
 * Cloudflare's post-response window: work handed to `ctx.waitUntil()` is cut off at 30 s, so a guard that lands on or past
 * this never runs and the refresh it was meant to release stays wedged for the isolate's lifetime.
 * `build/consistency-guard.ts` re-checks the relationship below whenever a fetch budget changes.
 */
export const PLATFORM_WAIT_UNTIL_CAP_MS = 30_000;

/** How far inside that cap the guard fires, so timer granularity on the platform side cannot push it outside. */
export const INFLIGHT_HANG_GUARD_MARGIN_MS = 2_000;

export const INFLIGHT_HANG_GUARD_MS = SHARED_REFRESH_TIMEOUT_MS + INFLIGHT_HANG_GUARD_MARGIN_MS;

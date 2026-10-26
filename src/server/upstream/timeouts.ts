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
const FEED_TIMEOUT_MS = 10_000;
export const FEED_FETCH_OPTS = { timeoutMs: FEED_TIMEOUT_MS, retries: 1 } as const;

/**
 * The wait before the single retry of a failure that never reached the upstream — DNS, refused, reset. Such an attempt
 * spends none of its timeout, but the retry has to land *after* the blip that caused it: two news-feed failures in one
 * dev session retried inside the same 500 ms and failed identically, while both hosts resolved again seconds later.
 *
 * 1.5 s is 3× the old attempt-0 backoff and keeps every call inside `WORST_CASE_UPSTREAM_CALL_MS` below:
 * 2 × 12 s + 1.5 s = 25.5 s (interactive) and 2 × 10 s + 1.5 s = 21.5 s (feeds), both under the 26 s and 22 s the
 * comment in `src/server/news/feeds.ts` and the hang guard are derived from. Raising it past `BACKOFF_MAX_MS` would
 * break that arithmetic without changing a single timeout value, which is why it stays bounded here.
 */
export const NETWORK_RETRY_BACKOFF_MS = 1_500;

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

/** How far after the refresh budget the guard waits, so a refresh that lands on its deadline still counts as done. */
export const INFLIGHT_HANG_GUARD_MARGIN_MS = 2_000;

/**
 * The guard fires this long after the refresh budget it protects: a refresh is allowed `SHARED_REFRESH_TIMEOUT_MS`
 * (26 s) to finish, and the guard then waits one margin before releasing a slot nothing came back for.
 *
 * The platform cap then still has one margin left (30 s − 28 s = 2 s), which is the room the timer itself needs. The
 * `waitUntil` ceiling is therefore the ceiling this is derived from, not a value the guard may land exactly on.
 */
export const INFLIGHT_HANG_GUARD_MS = SHARED_REFRESH_TIMEOUT_MS + INFLIGHT_HANG_GUARD_MARGIN_MS;

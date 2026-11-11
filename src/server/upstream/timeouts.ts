// Free plan: both external subrequests and simultaneous connections are capped per invocation.
const UPSTREAM_TIMEOUT_MS = 12_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

/**
 * RSS/Atom feeds. One dropped feed marks its whole news category partial, so a transient failure is worth one retry — with a
 * shorter per-attempt budget than the JSON path so the worst case still fits inside one news request.
 */
const FEED_TIMEOUT_MS = 10_000;
export const FEED_FETCH_OPTS = { timeoutMs: FEED_TIMEOUT_MS, retries: 1 } as const;

/**
 * The wait before the single retry of a failure that never reached the upstream — DNS, refused, reset — sits above the
 * attempt-0 backoff and keeps every call inside `WORST_CASE_UPSTREAM_CALL_MS`.
 */
export const NETWORK_RETRY_BACKOFF_MS = 1_500;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FEED_FETCH_OPTS] as const;

const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

export const SHARED_REFRESH_TIMEOUT_MS = WORST_CASE_UPSTREAM_CALL_MS;

/** Cloudflare's post-response window: work handed to `ctx.waitUntil()` is cut off at the platform's fixed cap, so a guard that lands on or past this never runs and its refresh stays wedged. `build/consistency-guard.ts` re-checks the relationship. */
export const PLATFORM_WAIT_UNTIL_CAP_MS = 30_000;

/** How far after the refresh budget the guard waits, so a refresh that lands on its deadline still counts as done. */
export const INFLIGHT_HANG_GUARD_MARGIN_MS = 2_000;

/**
 * The guard fires this long after the refresh budget it protects: a refresh gets the whole `SHARED_REFRESH_TIMEOUT_MS`, and
 * the guard waits one margin more, the room the timer itself needs to run before releasing a slot.
 */
export const INFLIGHT_HANG_GUARD_MS = SHARED_REFRESH_TIMEOUT_MS + INFLIGHT_HANG_GUARD_MARGIN_MS;

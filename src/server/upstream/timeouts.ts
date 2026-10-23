// Free plan: 50 external subrequests and 6 simultaneous connections per invocation.
const UPSTREAM_TIMEOUT_MS = 12_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

/**
 * RSS/Atom feeds. One dropped feed marks its whole news category partial, so a transient failure is worth one retry —
 * with a shorter per-attempt budget than the JSON path so the worst case (2 × 8s + backoff) still fits inside a single
 * news request, whose legs share the 6-connection pool.
 */
export const FEED_TIMEOUT_MS = 8_000;
export const FEED_FETCH_OPTS = { timeoutMs: FEED_TIMEOUT_MS, retries: 1 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FEED_FETCH_OPTS] as const;

const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

export const SHARED_REFRESH_TIMEOUT_MS = WORST_CASE_UPSTREAM_CALL_MS;

// The guard must still fire inside the platform's post-response window, so it sits just past the refresh budget.
// The guard must still fire inside the platform's post-response window: ctx.waitUntil() is capped at 30 s, so the guard
// sits just past the refresh budget with two seconds to spare instead of landing exactly on the cap.
export const INFLIGHT_HANG_GUARD_MS = SHARED_REFRESH_TIMEOUT_MS + 2_000;

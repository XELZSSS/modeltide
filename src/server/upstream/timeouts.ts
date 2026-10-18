// Free plan: 50 external subrequests and 6 simultaneous connections per invocation.
// Per-call timeouts stay short so one slow upstream cannot wedge the slot pool.
const UPSTREAM_TIMEOUT_MS = 12_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 0 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS] as const;

const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

export const SHARED_REFRESH_TIMEOUT_MS = WORST_CASE_UPSTREAM_CALL_MS;

// The guard must still fire inside the platform's post-response window, so it sits just past the refresh budget.
export const INFLIGHT_HANG_GUARD_MS = SHARED_REFRESH_TIMEOUT_MS + 4_000;

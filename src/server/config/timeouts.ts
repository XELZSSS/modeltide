import { WARM_TASK_TIMEOUT_MS } from "@/server/config/cron";

const UPSTREAM_TIMEOUT_MS = 10_000;
const RSS_TIMEOUT_MS = 7_000;

export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: RSS_TIMEOUT_MS, retries: 0 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS] as const;

export const WORST_CASE_UPSTREAM_CALL_MS =
  Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

export const PROBE_TIMEOUT_MS = 8_000;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const UPSTREAM_BACKGROUND_SLOTS = 4;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

export const SHARED_REFRESH_TIMEOUT_MS = 25_000;

const INFLIGHT_GUARD_MARGIN_MS = 5_000;

export const INFLIGHT_HANG_GUARD_MS = Math.max(
  WORST_CASE_UPSTREAM_CALL_MS * 2,
  WARM_TASK_TIMEOUT_MS + INFLIGHT_GUARD_MARGIN_MS,
);

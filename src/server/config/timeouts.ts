import { WARM_TASK_TIMEOUT_MS } from "@/server/config/cron";
import { WORST_CASE_UPSTREAM_CALL_MS } from "@/shared/config/time";

export { BACKOFF_MAX_MS, UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS } from "@/shared/config/time";

export const PROBE_TIMEOUT_MS = 8_000;

export const UPSTREAM_MAX_CONNECTIONS = 6;

export const RETRY_AFTER_MAX_MS = 5 * 60_000;

const INFLIGHT_GUARD_MARGIN_MS = 5_000;

export const INFLIGHT_HANG_GUARD_MS = Math.max(
  WORST_CASE_UPSTREAM_CALL_MS * 2,
  WARM_TASK_TIMEOUT_MS + INFLIGHT_GUARD_MARGIN_MS,
);

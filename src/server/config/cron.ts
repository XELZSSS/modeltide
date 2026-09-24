export const SAMPLE_TIMEOUT_MS = 90_000;
export const WARM_TASK_TIMEOUT_MS = 45_000;
export const WARM_CONCURRENCY = 2;
export const PING_TIMEOUT_MS = 5_000;
export const PROBE_CONCURRENCY = 3;
export const PROVIDER_CONCURRENCY = 3;
export const NEWS_LEG_CONCURRENCY = 2;

export function warmBatchTimeoutMs(taskCount: number): number {
  const rounds = Math.ceil(Math.max(1, taskCount) / WARM_CONCURRENCY);
  return WARM_TASK_TIMEOUT_MS * (rounds + 1);
}

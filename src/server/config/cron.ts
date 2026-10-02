// Short deadlines fail fast instead of aborting the whole round with "aborted" for every source.
export const SAMPLE_TIMEOUT_MS = 90_000;
export const WARM_TASK_TIMEOUT_MS = 25_000;
export const WARM_CONCURRENCY = 2;
export const PING_TIMEOUT_MS = 5_000;
// 4 + 2 = 6 in-flight fetches: the runtime's simultaneous-connection limit, so sampling never self-throttles.
export const PROBE_CONCURRENCY = 4;
export const PROVIDER_CONCURRENCY = 2;
export const NEWS_LEG_CONCURRENCY = 2;

export function warmBatchTimeoutMs(taskCount: number): number {
  const rounds = Math.ceil(Math.max(1, taskCount) / WARM_CONCURRENCY);
  return WARM_TASK_TIMEOUT_MS * (rounds + 1);
}

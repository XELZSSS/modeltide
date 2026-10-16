const MAX_PARTIAL_POLLS = 5;

const partialPollCounts = new Map<string, number>();

interface PollQuery {
  queryKey?: readonly unknown[];
  state?: { data?: unknown; dataUpdateCount?: number; errorUpdateCount?: number };
}

export function partialPollInterval(
  query: unknown,
  isPartialData: (data: unknown) => boolean,
  partialRefetchMs: number,
): number | false {
  if (query == null || typeof query !== "object") return false;
  const pollQuery = query as PollQuery;
  const pollKey = JSON.stringify(pollQuery.queryKey ?? null);
  const state = pollQuery.state;
  if (!isPartialData(state?.data)) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  const settled = (state?.dataUpdateCount ?? 0) + (state?.errorUpdateCount ?? 0);
  // A query reset (route change) zeroes dataUpdateCount; restart the window
  // from the current count instead of keeping a stale, larger base.
  const prev = partialPollCounts.get(pollKey);
  const base = prev == null || settled < prev ? settled : prev;
  partialPollCounts.set(pollKey, base);
  if (settled - base >= MAX_PARTIAL_POLLS) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  return partialRefetchMs;
}

const MAX_PARTIAL_POLLS = 5;

// Entries are removed only when the payload stops being partial or the poll
// budget is spent, so a source that stays partial forever (or a memoized key
// that is never revisited) would otherwise leak one entry per key. Bound it
// with LRU eviction, matching the memoization in api/catalog.ts.
const MAX_TRACKED_KEYS = 256;

const partialPollCounts = new Map<string, number>();

function trackBase(pollKey: string, base: number): void {
  // Re-insert so the most recently polled key sorts as newest for eviction.
  partialPollCounts.delete(pollKey);
  partialPollCounts.set(pollKey, base);
  if (partialPollCounts.size <= MAX_TRACKED_KEYS) return;
  const oldest = partialPollCounts.keys().next();
  if (!oldest.done) partialPollCounts.delete(oldest.value);
}

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
  trackBase(pollKey, base);
  if (settled - base >= MAX_PARTIAL_POLLS) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  return partialRefetchMs;
}

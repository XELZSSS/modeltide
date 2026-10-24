const MAX_PARTIAL_POLLS = 5;

const MAX_TRACKED_KEYS = 256;

const partialPollCounts = new Map<string, number>();

function trackBase(pollKey: string, base: number): void {
  partialPollCounts.delete(pollKey);
  partialPollCounts.set(pollKey, base);
  if (partialPollCounts.size <= MAX_TRACKED_KEYS) return;
  const oldest = partialPollCounts.keys().next();
  if (!oldest.done) partialPollCounts.delete(oldest.value);
}

/**
 * The slice of TanStack's `Query` this reads. Narrower than the real type so the module carries no query-core import,
 * but every field is required: the caller hands over a live `Query`, whose key and counters always exist.
 */
interface PollQuery {
  queryKey: readonly unknown[];
  state: { data: unknown; dataUpdateCount: number; errorUpdateCount: number };
}

/**
 * How long to wait before the next refetch while a payload is still `partial`, or `false` once it is complete or the
 * polling budget for that query is spent.
 */
export function partialPollInterval(
  query: PollQuery,
  isPartialData: (data: unknown) => boolean,
  partialRefetchMs: number,
): number | false {
  const pollKey = JSON.stringify(query.queryKey);
  const { state } = query;
  if (!isPartialData(state.data)) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  const settled = state.dataUpdateCount + state.errorUpdateCount;
  const prev = partialPollCounts.get(pollKey);
  const base = prev == null || settled < prev ? settled : prev;
  trackBase(pollKey, base);
  if (settled - base >= MAX_PARTIAL_POLLS) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  return partialRefetchMs;
}

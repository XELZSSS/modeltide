// Cross-source row-shaping helpers: the sort/dedupe/rank boilerplate every
// source pipeline repeats once its parser has produced raw rows.

/** Date.parse with a -Infinity fallback so unparseable dates always sort last. */
export function parseTs(v: unknown, positiveOnly = false): number {
  if (typeof v !== "string") return Number.NEGATIVE_INFINITY;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || (positiveOnly && t <= 0)) return Number.NEGATIVE_INFINITY;
  return t;
}

export function byDateDesc<T>(getDate: (item: T) => unknown): (a: T, b: T) => number {
  return (a, b) => parseTs(getDate(b)) - parseTs(getDate(a));
}

/**
 * Descending numeric score; null/unfinite scores sink to the bottom, and two
 * scoreless items compare equal instead of producing a NaN comparator.
 */
export function byNumberDesc<T>(score: (item: T) => number | null | undefined): (a: T, b: T) => number {
  return (a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa == null && sb == null) return 0;
    return (sb ?? Number.NEGATIVE_INFINITY) - (sa ?? Number.NEGATIVE_INFINITY);
  };
}

/** Assign 1-based ranks in the given order, without re-sorting. */
export function withRanks<T>(items: T[]): (T & { rank: number })[] {
  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

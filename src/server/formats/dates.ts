const ISO_LIKE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:[T ]\S*)?$/;
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts a full ISO-like timestamp, including one with a time part. */
export const isoDate = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return ISO_LIKE_RE.test(t) ? t : null;
};

/** Accepts a bare `YYYY-MM-DD` date, rejecting timestamps. */
export const isoDateOnly = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return ISO_DATE_ONLY_RE.test(t) ? t : null;
};

export function parseTs(v: unknown, positiveOnly = false): number {
  if (typeof v !== "string") return Number.NEGATIVE_INFINITY;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || (positiveOnly && t <= 0)) return Number.NEGATIVE_INFINITY;
  return t;
}

export function sortByDateDesc<T>(items: T[], getDate: (item: T) => unknown): T[] {
  const stamped = items.map((item) => ({ item, ts: parseTs(getDate(item)) }));
  stamped.sort((a, b) => (a.ts === b.ts ? 0 : b.ts - a.ts));
  for (let i = 0; i < items.length; i++) items[i] = stamped[i]!.item;
  return items;
}

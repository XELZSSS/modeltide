/** The `YYYY-MM-DD` core both patterns below share: `\d{2}` accepted `2024-13-01` and the `0000-00-00` placeholder, and
 * a string like that sorts below every real date, so `isRetiredRankEntry` retired a live row. */
const ISO_DATE_CORE = String.raw`\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])`;
const ISO_LIKE_RE = new RegExp(`^${ISO_DATE_CORE}(?:[T ]\\S*)?$`);
const ISO_DATE_ONLY_RE = new RegExp(`^${ISO_DATE_CORE}$`);

/** Accepts a full ISO-like timestamp, including one with a time part. */
export const isoDate = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return ISO_LIKE_RE.test(t) ? t : null;
};

/** Accepts a bare `YYYY-MM-DD` date, rejecting timestamps. */
const isoDateOnly = (t: string): string | null => {
  const s = t.trim();
  return ISO_DATE_ONLY_RE.test(s) ? s : null;
};

/** The `YYYY-MM-DD` prefix of a timestamp, when that prefix is a real date; anything else falls out as `null`. */
export const isoDatePrefix = (v: unknown): string | null =>
  typeof v === "string" ? isoDateOnly(v.slice(0, 10)) : null;
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

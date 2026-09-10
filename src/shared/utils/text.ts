export function dedupeBy<T>(items: T[], keyFn: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v.trim() || null : null;
}

const QUALIFIER_TOKENS = new Set(["adaptive", "effort", "xhigh", "extended"]);

export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const main = lowered.slice(Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/")) + 1);
  return main
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
}

function foldSearchStr(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

export function matchTerm(fields: string[], term: string): { matched: boolean; score: number } {
  const needle = foldSearchStr(term);
  if (!needle) return { matched: false, score: 0 };
  const normalized = fields.map(foldSearchStr);
  for (const f of normalized) if (f === needle) return { matched: true, score: 4 };
  let best = 0;
  for (const f of normalized) {
    if (f.startsWith(needle)) best = Math.max(best, 3);
    else if (f.includes(needle)) best = Math.max(best, 2);
  }
  return { matched: best > 0, score: best };
}

export function filterByTerm<T>(items: T[], term: string, getFields: (item: T) => (string | null | undefined)[]): T[] {
  if (!foldSearchStr(term)) return items;
  return items.filter(
    (item) =>
      matchTerm(
        getFields(item).filter((f): f is string => typeof f === "string" && f.length > 0),
        term,
      ).matched,
  );
}

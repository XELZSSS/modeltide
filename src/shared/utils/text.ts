export function dedupeBy<T>(items: T[], keyFn: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key) return true;
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

const FUZZY_MIN_TERM = 3;
const FUZZY_MAX_DISTANCE = 2;

function levenshteinWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  let curr: number[] = Array.from({ length: lb + 1 }, () => 0);
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb]!;
}

function fuzzyHit(hay: string, needle: string): boolean {
  const text = hay.toLowerCase();
  if (text.includes(needle)) return true;
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    if (levenshteinWithin(token, needle, FUZZY_MAX_DISTANCE) <= FUZZY_MAX_DISTANCE) return true;
  }
  return false;
}

/**
 * Typo-tolerant fallback for model search. Exact/prefix/substring tiers in
 * `matchTerm` run first; this only rescues items those tiers miss (score 1).
 * Zero-dependency (no fuse.js) so the search input stays out of the main bundle.
 */
export function fuzzyMatch<T>(items: T[], term: string, getFields: (item: T) => (string | null | undefined)[]): T[] {
  const needle = term.toLowerCase().trim();
  if (needle.length < FUZZY_MIN_TERM || items.length === 0) return [];
  const out: T[] = [];
  for (const item of items) {
    const fields = getFields(item);
    for (const f of fields) {
      if (typeof f !== "string" || f.length === 0) continue;
      if (fuzzyHit(f, needle)) {
        out.push(item);
        break;
      }
    }
  }
  return out;
}

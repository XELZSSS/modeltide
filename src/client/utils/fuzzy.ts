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
 * `matchTerm` run first; this only rescues items those tiers miss (score 1),
 * so ranked results keep their existing order.
 *
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

export function foldSearchStr(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

export function usableFields(fields: (string | null | undefined)[]): string[] {
  return fields.filter((f): f is string => typeof f === "string" && f.length > 0);
}

export function matchTerm(fields: string[], needle: string): { matched: boolean; score: number } {
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
  const needle = foldSearchStr(term);
  if (!needle) return items;
  return items.filter((item) => matchTerm(usableFields(getFields(item)), needle).matched);
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

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.split(WORD_SPLIT)) {
    if (!word) continue;
    tokens.push(word);
    if (!CJK_CHAR.test(word)) continue;
    const chars = [...word];
    for (let i = 0; i + 1 < chars.length; i++) tokens.push(chars[i]! + chars[i + 1]!);
  }
  return tokens;
}

function fuzzyHit(hay: string, needle: string): boolean {
  const text = hay.toLowerCase();
  if (text.includes(needle)) return true;
  for (const token of tokenize(text)) {
    if (levenshteinWithin(token, needle, FUZZY_MAX_DISTANCE) <= FUZZY_MAX_DISTANCE) return true;
  }
  return false;
}

export function fuzzyMatch<T>(candidates: { item: T; fields: string[] }[], term: string): T[] {
  const needle = foldSearchStr(term);
  if (needle.length < FUZZY_MIN_TERM || candidates.length === 0) return [];
  const out: T[] = [];
  for (const { item, fields } of candidates) {
    for (const f of fields) {
      if (fuzzyHit(f, needle)) {
        out.push(item);
        break;
      }
    }
  }
  return out;
}

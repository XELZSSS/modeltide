/**
 * Term match over pre-lowercased field values. Scores: 4 = exact, 3 = prefix,
 * 2 = substring, 0 = no match. Normalizes the term (lower + trim) internally;
 * callers pass fields through the same normalization. An empty term never
 * matches ("" is a prefix of everything, so guard explicitly).
 */
export function matchTerm(fields: string[], term: string): { matched: boolean; score: number } {
  const needle = term.toLowerCase().trim();
  if (!needle) return { matched: false, score: 0 };
  for (const f of fields) if (f === needle) return { matched: true, score: 4 };
  let best = 0;
  for (const f of fields) best = Math.max(best, f.startsWith(needle) ? 3 : f.includes(needle) ? 2 : 0);
  return { matched: best > 0, score: best };
}

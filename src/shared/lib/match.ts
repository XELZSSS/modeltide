export function matchTerm(fields: string[], term: string): { matched: boolean; score: number } {
  for (const f of fields) if (f === term) return { matched: true, score: 4 };
  let best = 0;
  for (const f of fields) best = Math.max(best, f.startsWith(term) ? 3 : f.includes(term) ? 2 : 0);
  return { matched: best > 0, score: best };
}

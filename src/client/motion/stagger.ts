export function staggerStyle(index: number): Record<string, string> {
  const safe = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return { "--motion-stagger-index": String(safe) };
}

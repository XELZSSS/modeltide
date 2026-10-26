export function staggerStyle(index: number): Record<string, string> {
  return { "--motion-stagger-index": String(index) };
}

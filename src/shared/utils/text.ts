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

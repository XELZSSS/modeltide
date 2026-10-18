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

function tokensOf(segment: string): string {
  return segment
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
}

export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const lastSep = Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/"));
  // A tail with no usable token (e.g. ":free") would collapse to a bare qualifier and collide across models, so fall back to the whole string.
  const tail = tokensOf(lastSep >= 0 ? lowered.slice(lastSep + 1) : lowered);
  if (tail) return tail;
  return tokensOf(lowered);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function titleCase(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

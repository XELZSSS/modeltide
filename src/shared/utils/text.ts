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

/**
 * Concatenates the alphanumeric runs of a segment, dropping qualifier words. Scanning replaces `split` + `filter` +
 * `join`, which allocated a token array for every model id in a 20k-row directory.
 */
function tokensOf(segment: string): string {
  let out = "";
  let runStart = -1;
  for (let i = 0; i <= segment.length; i++) {
    const c = i < segment.length ? segment.charCodeAt(i) : -1;
    const isTokenChar = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39);
    if (isTokenChar) {
      if (runStart === -1) runStart = i;
      continue;
    }
    if (runStart === -1) continue;
    const token = segment.slice(runStart, i);
    runStart = -1;
    if (!QUALIFIER_TOKENS.has(token)) out += token;
  }
  return out;
}

const PAREN_GROUP_RE = /\([^)]*\)/g;

export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase();
  const stripped = lowered.includes("(") ? lowered.replace(PAREN_GROUP_RE, " ") : lowered;
  const lastSep = Math.max(stripped.lastIndexOf(":"), stripped.lastIndexOf("/"));
  const tail = tokensOf(lastSep >= 0 ? stripped.slice(lastSep + 1) : stripped);
  if (tail) return tail;
  return tokensOf(stripped);
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

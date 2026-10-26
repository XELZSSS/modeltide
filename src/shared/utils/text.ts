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
 * A variant suffix that names a price tier rather than a model. `openai/gpt-4o:free` used to normalize to `free`, and so
 * did every other free variant in the catalog — one key for the whole price tier, so a pricing or metadata lookup could
 * answer with another model's row and nothing reported the mismatch. The base model is what the key has to carry.
 */
const PRICE_TIER_TAGS = new Set(["free"]);

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

/** The last `/`- or `:`-delimited segment of a path, and what is left of the path once that segment is dropped. */
function splitTail(segment: string): { tail: string; parent: string } {
  const at = Math.max(segment.lastIndexOf(":"), segment.lastIndexOf("/"));
  return {
    tail: tokensOf(at >= 0 ? segment.slice(at + 1) : segment),
    parent: at >= 0 ? segment.slice(0, at) : "",
  };
}

const PAREN_GROUP_RE = /\([^)]*\)/g;

export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase();
  const stripped = lowered.includes("(") ? lowered.replace(PAREN_GROUP_RE, " ") : lowered;
  const { tail, parent } = splitTail(stripped);
  if (tail && !PRICE_TIER_TAGS.has(tail)) return tail;
  // A price tier is not a name: `openai/gpt-4o:free` is the model `openai/gpt-4o`, and the key has to say so. The
  // parent is split the same way, so a price-tier tail drops the same way a provider prefix does.
  if (tail && parent) {
    const base = splitTail(parent).tail;
    if (base) return base;
  }
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

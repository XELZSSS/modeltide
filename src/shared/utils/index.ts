// Isomorphic utilities shared between the React app and the Cloudflare Worker.
// App-only helpers (charts, cn, format, model) live in `src/client/utils`.

/**
 * Keeps the first occurrence of each key ("first wins"); items with an empty key
 * are always kept. Callers relying on priority (e.g. highest-elo) must pre-sort
 * so the winner comes first.
 */
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

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v.trim() || null : null;
}

/**
 * Percent-like benchmark values arrive in mixed scales (0-1 fractions from some
 * benchmarks, 0-100 percentage points from others); fractions are scaled up so
 * everything renders on one 0-100 scale, then clamped into the valid range.
 *
 * Scale ambiguity: a literal `1` always becomes `100` (it reads as "100%"), so a
 * source whose unit is "1%" must pre-scale. Non-finite input (NaN/Infinity)
 * returns null instead of leaking into formatPercent ("NaN%").
 */
export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

/** Approximate equality using a relative epsilon, so scale doesn't matter. */
export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Effort/variant qualifier tokens stripped when building loose cross-source match keys.
 * NOTE: bare "max" is intentionally NOT stripped — it collides real model names
 * ("Model Max" vs "Model"). Parenthesized "(Max Effort)" labels are already removed
 * by the paren regex in normalizeModelKey, so effort matching still works. */
const QUALIFIER_TOKENS = new Set([
  "adaptive",
  "reasoning",
  "thinking",
  "effort",
  "xhigh",
  "high",
  "medium",
  "low",
  "ultra",
  "extended",
]);

/**
 * Loose match key for cross-source model matching: drops creator prefixes ("Org:" /
 * "org/"), parenthesized variant labels, effort qualifier tokens and all separators,
 * so "DeepSeek V4 Pro 0813 (Reasoning, Max Effort)" and "deepseek/deepseek-v4-pro-0813"
 * collapse to the same key. Both sides must normalize identically for a match.
 */
export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const main = lowered.slice(Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/")) + 1);
  return main
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
}

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

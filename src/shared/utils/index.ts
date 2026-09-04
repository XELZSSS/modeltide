// Shared by the React app and the Cloudflare Worker.

/** Keeps the first occurrence of each key; empty keys are always kept. */
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
 * Benchmark values arrive in mixed scales (0-1 fractions vs 0-100 points);
 * fractions are scaled up, then clamped. Non-finite input returns null.
 */
export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

/** Approximate equality with a relative epsilon. */
export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Qualifier tokens stripped when building loose cross-source match keys. */
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
 * Loose match key for cross-source model matching: drops creator prefixes,
 * parenthesized labels, qualifier tokens and separators. Both sides must
 * normalize identically for a match.
 */
export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const main = lowered.slice(Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/")) + 1);
  return main
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
}

/** Term match over pre-lowercased fields: 4 = exact, 3 = prefix, 2 = substring. */
export function matchTerm(fields: string[], term: string): { matched: boolean; score: number } {
  const needle = term.toLowerCase().trim();
  if (!needle) return { matched: false, score: 0 };
  for (const f of fields) if (f === needle) return { matched: true, score: 4 };
  let best = 0;
  for (const f of fields) best = Math.max(best, f.startsWith(needle) ? 3 : f.includes(needle) ? 2 : 0);
  return { matched: best > 0, score: best };
}

/** Blended price: 7:2:1 weighted mix of cached-input / input / output ($/1M). */
export function computeBlendPrice(
  p?: { input?: number | null; output?: number | null; cache_hit?: number | null; cacheHit?: number | null } | null,
): number | null {
  if (!p) return null;
  const input = isFiniteNumber(p.input) ? p.input : null;
  const output = isFiniteNumber(p.output) ? p.output : null;
  if (input == null || output == null) return null;
  const cache = isFiniteNumber(p.cacheHit) ? p.cacheHit : isFiniteNumber(p.cache_hit) ? p.cache_hit : input;
  return (7 * cache + 2 * input + output) / 10;
}

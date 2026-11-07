import { normalizeModelKey } from "@/shared/utils";

export type Lookup<T> = Map<string, T> | Record<string, T>;

const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

/**
 * `normalizeModelKey` behind a shared memo. Exported because the AA catalog's metadata backfill normalizes the same
 * model names on every refresh: one cache serves both lookups instead of a second copy of the same table.
 */
export function normalizedModelKey(raw: string): string {
  const cached = normalizedKeyCache.get(raw);
  if (cached !== undefined) {
    // Re-insert on hit so pruning evicts the least recently used key: a directory refresh asks about the same model
    // names every time, and pruning in insertion order dropped exactly the keys a listing larger than the cap reuses.
    normalizedKeyCache.delete(raw);
    normalizedKeyCache.set(raw, cached);
    return cached;
  }
  const normalized = normalizeModelKey(raw);
  normalizedKeyCache.set(raw, normalized);
  // Evict the oldest key directly: `pruneBounded` with a constant-false predicate walked the whole 8k-entry cache on
  // every miss past the cap, and a cold directory refresh misses tens of thousands of times.
  if (normalizedKeyCache.size > NORMALIZED_KEY_CACHE_MAX) {
    const oldest = normalizedKeyCache.keys().next();
    if (!oldest.done) normalizedKeyCache.delete(oldest.value);
  }
  return normalized;
}

export function lookupHit<T>(table: Lookup<T>, key: string): T | undefined {
  if (table instanceof Map) return table.get(key);
  if (Object.hasOwn(table, key)) return table[key];
  return undefined;
}

/**
 * Every index form one model row is filed under, in lookup order: each raw value lowercased first, then each value's
 * normalized form. Writers (`recordPricing`, `recordMeta`) and readers (`resolvePricing`, `resolveExpiry`) have to
 * build the same set — a candidate the writer never filed is a silent miss that surfaces as a lost price or a lost
 * expiry date, never as an error — so both sides come through here.
 *
 * The raw forms come first on purpose: a normalized form is lossy by design (a variant tail keeps only its own
 * segment), so it must never shadow the exact key beside it. `target` is passed in because the directory records reuse
 * one Set across 20k rows.
 */
export function fillModelKeys(target: Set<string>, values: readonly unknown[]): void {
  target.clear();
  // Two passes over `values` rather than one over a `present` copy: every raw form has to be probed before any
  // normalized one, and that copy was an array per call for a directory that makes tens of thousands of them.
  for (const value of values) if (typeof value === "string" && value !== "") target.add(value.toLowerCase());
  for (const value of values) {
    if (typeof value !== "string" || value === "") continue;
    const normalized = normalizedModelKey(value);
    if (normalized !== "") target.add(normalized);
  }
}

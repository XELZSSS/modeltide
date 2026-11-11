import { normalizeModelKey } from "@/shared/utils";

export type Lookup<T> = Map<string, T> | Record<string, T>;

const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

/** `normalizeModelKey` behind a shared memo, exported so the AA catalog's metadata backfill normalizes through the same cache. */
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
  // Evict the oldest key directly: `pruneBounded` with a constant-false predicate walked the whole cache on every miss.
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
 * normalized form. Writers and readers have to build the same set — a candidate the writer never filed is a silent miss —
 * so both sides come through here. Raw forms come first: a normalized form is lossy and must not shadow the exact key.
 */
export function fillModelKeys(target: Set<string>, values: readonly unknown[]): void {
  target.clear();
  // Two passes over `values` rather than one over a `present` copy: every raw form has to be probed before any normalized one.
  for (const value of values) if (typeof value === "string" && value !== "") target.add(value.toLowerCase());
  for (const value of values) {
    if (typeof value !== "string" || value === "") continue;
    const normalized = normalizedModelKey(value);
    if (normalized !== "") target.add(normalized);
  }
}

import { normalizeModelKey } from "@/shared/utils";

export type Lookup<T> = Map<string, T> | Record<string, T>;

const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

export function normalizeKeyCached(raw: string): string {
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
  return table instanceof Map ? table.get(key) : Object.hasOwn(table, key) ? table[key] : undefined;
}

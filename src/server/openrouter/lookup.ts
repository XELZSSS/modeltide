import { normalizeModelKey } from "@/shared/utils";

export type Lookup<T> = Map<string, T> | Record<string, T>;

const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

function normalizeKeyCached(raw: string): string {
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
  const present: string[] = [];
  for (const value of values) if (typeof value === "string" && value !== "") present.push(value);
  target.clear();
  for (const value of present) target.add(value.toLowerCase());
  for (const value of present) {
    const normalized = normalizeKeyCached(value);
    if (normalized !== "") target.add(normalized);
  }
}

/** The same forms as `fillModelKeys`, for the read paths that do not keep a Set around. */
export function modelKeyCandidates(values: readonly unknown[]): string[] {
  const keys = new Set<string>();
  fillModelKeys(keys, values);
  return [...keys];
}

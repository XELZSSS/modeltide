import { normalizeModelKey } from "@/shared/utils";
import { pruneBounded } from "@/server/util/throttle";

export type Lookup<T> = Map<string, T> | Record<string, T>;

const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

export function normalizeKeyCached(raw: string): string {
  let normalized = normalizedKeyCache.get(raw);
  if (normalized === undefined) {
    normalized = normalizeModelKey(raw);
    normalizedKeyCache.set(raw, normalized);
    pruneBounded(normalizedKeyCache, NORMALIZED_KEY_CACHE_MAX, () => false);
  }
  return normalized;
}

export function lookupHit<T>(table: Lookup<T>, key: string): T | undefined {
  return table instanceof Map ? table.get(key) : Object.hasOwn(table, key) ? table[key] : undefined;
}

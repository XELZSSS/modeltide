/**
 * "Keep the newest N entries" is needed twice in the client: the per-id query memo in `api/catalog.ts` and the
 * per-route search term memory in `stores/search-store.ts`. Both had their own hand-rolled eviction; this is the
 * single owner of that policy.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): V {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
    return value;
  }
}

/**
 * The same policy for a plain object, which has to stay serialisable as Pinia store state: the newest `max` keys
 * are kept in insertion order, the key being written moves to the end.
 */
export function boundedRecord<V>(record: Record<string, V>, key: string, value: V, max: number): Record<string, V> {
  const next: Record<string, V> = { ...record };
  delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  return Object.fromEntries(keys.slice(keys.length - max).map((name) => [name, next[name]!]));
}

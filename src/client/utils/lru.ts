/**
 * "Keep the newest N entries" is the one eviction policy the client has: the per-id query memo in `api/catalog.ts`,
 * the last `ETag` per request URL in `api/api-client.ts` and the partial-poll counters in `api/partial-poll.ts`. Each
 * used to carry its own `delete` + `set` + evict-the-oldest loop.
 *
 * `set` returns the value so a caller can write `cache.get(k) ?? cache.set(k, create(k))`. Recency is insertion order,
 * which is what a bare `Map` already maintains.
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

  delete(key: K): boolean {
    return this.map.delete(key);
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

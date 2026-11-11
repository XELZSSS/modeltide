/** "Keep the newest N entries": the client's one eviction policy (the per-id query memo, the last `ETag` per request URL,
 * the partial-poll counters). `set` returns the value so a caller can write `cache.get(k) ?? cache.set(k, create(k))`;
 * recency is insertion order, which is what a bare `Map` already maintains. */
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
    // `delete` then `set` raises the size by at most one, so one eviction of the oldest key restores the cap.
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
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

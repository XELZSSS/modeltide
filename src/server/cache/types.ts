export interface CacheResult<T> {
  value: T;
  degraded: boolean;
  /** The serialized response body, when the entry was stored with one: the router serves it directly; a value without a body falls back to `JSON.stringify`. */
  body?: string;
  /** When this payload was produced (epoch ms), carried by the entry rather than by the body. */
  producedAt: number;
}

export interface CacheScope {
  /**
   * The stale budget for one stored copy, decided by the copy itself: the Hugging Face by-id lookup caches its not-found
   * answer briefly and that cap must not apply to the whole source. `undefined` keeps the normal budget.
   */
  staleCapMs?: (value: unknown) => number | undefined;
  /** Whether this source hands its payload to a route; internal sources (`served: false`) compose their value into another source, so no response copy is kept. */
  serveBody?: boolean;
}

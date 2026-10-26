export interface CacheResult<T> {
  value: T;
  degraded: boolean;
  /**
   * The serialized response body, when the entry was stored with one. The router serves it directly instead of
   * re-encoding the object; a value without a body (a degraded copy) falls back to `JSON.stringify`.
   */
  body?: string;
  /** When this payload was produced (epoch ms), carried by the entry rather than by the body. */
  producedAt: number;
}

export interface CacheScope {
  /**
   * The stale budget for one stored copy, decided by the copy itself. The Hugging Face by-id lookup answers `null` for an
   * id it could not read and caches that miss briefly; the cap has to reach the *not-found* entry only, because applying
   * it to the whole source also expired found models after five minutes. `undefined` keeps the normal budget.
   */
  staleCapMs?: (value: unknown) => number | undefined;
  /**
   * Whether this source hands its payload to a route. Internal sources (`served: false`) compose their value into
   * another source and never answer a request themselves, so the cache does not keep a response copy for them.
   */
  serveBody?: boolean;
}

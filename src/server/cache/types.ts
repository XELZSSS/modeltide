export interface CacheResult<T> {
  value: T;
  degraded: boolean;
  /**
   * The serialized response body, when the entry was stored with one. The router serves it directly instead of
   * re-encoding the object; a value without a body (a degraded copy) falls back to `JSON.stringify`.
   */
  body?: string;
}

export interface CacheScope {
  staleCapMs?: number;
  /**
   * Whether this source hands its payload to a route. Internal sources (`served: false`) compose their value into
   * another source and never answer a request themselves, so the cache does not keep a response copy for them.
   */
  serveBody?: boolean;
}

export interface CacheResult<T> {
  value: T;
  degraded: boolean;
}

export interface CacheScope {
  memoryOnly?: boolean;
  staleCapMs?: number;
}

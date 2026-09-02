import type { AppContext } from "@/server/context";

/** Unified contract for all upstream data sources — enables registry, uniform TTL and error handling. */
export interface DataSource<T, P = unknown> {
  /** Stable key matching `API_DOMAINS` / `cacheKeys` / `queryKeys`. */
  readonly key: string;
  /** Default TTL in ms; use `ttlFor(partial)` when result is degraded. */
  readonly defaultTtl: number;
  /** Fetch and normalize upstream data; `params` are validated query params. */
  fetch(ctx: AppContext, params: P): Promise<{ data: T; ttl?: number }>;
}

export type DataSourceMap = Map<string, DataSource<unknown, unknown>>;

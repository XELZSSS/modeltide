import type { DataSource } from "@/server/core/data-source";

/**
 * Registry holding all `DataSource` instances by key.
 * Ensures API_DOMAINS / cacheKeys / queryKeys stay aligned via a single registration point.
 */
export class SourceRegistry {
  private sources = new Map<string, DataSource<unknown, unknown>>();

  register<T, P>(ds: DataSource<T, P>): this {
    if (this.sources.has(ds.key)) throw new Error(`DataSource duplicate key: ${ds.key}`);
    this.sources.set(ds.key, ds as DataSource<unknown, unknown>);
    return this;
  }

  get<T>(key: string): DataSource<T> | undefined {
    return this.sources.get(key) as DataSource<T> | undefined;
  }

  keys(): string[] {
    return [...this.sources.keys()];
  }

  entries(): IterableIterator<[string, DataSource<unknown, unknown>]> {
    return this.sources.entries();
  }
}

export const globalRegistry = new SourceRegistry();

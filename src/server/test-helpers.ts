import type { AppContext } from "@/server/context";
import { CacheService } from "@/server/infra/cache/service";

interface MapKVHooks {
  failPut?: boolean;
  onPut?: (key: string, value: string, opts?: unknown) => void;
  onDelete?: (key: string) => void;
}

interface MapKV extends KVNamespace {
  store: Map<string, string>;
  failPut: boolean;
}

/** In-memory KVNamespace backed by a Map, with write-failure injection for error paths. */
export function mapKV(store = new Map<string, string>(), hooks: MapKVHooks = {}): MapKV {
  const kv = {
    store,
    failPut: hooks.failPut ?? false,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, opts?: unknown): Promise<void> {
      if (kv.failPut) throw new Error("kv write failed");
      hooks.onPut?.(key, value, opts);
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      hooks.onDelete?.(key);
      store.delete(key);
    },
  };
  return kv as unknown as MapKV;
}

interface TestCtxOptions {
  http?: AppContext["http"];
  log?: AppContext["log"];
  version?: string;
  kvHooks?: MapKVHooks;
}

/**
 * Standard server-test context: Map-backed KV + real CacheService + silent
 * log. Returns the store for assertions alongside the context.
 */
export function testCtx(
  store = new Map<string, string>(),
  opts: TestCtxOptions = {},
): { ctx: AppContext; kvStore: Map<string, string>; kv: MapKV } {
  const kv = mapKV(store, opts.kvHooks);
  const ctx = {
    cache: new CacheService(kv, opts.version ?? "v-test"),
    http: opts.http ?? ({} as AppContext["http"]),
    kv,
    log: opts.log ?? (() => {}),
  } as AppContext;
  return { ctx, kvStore: store, kv };
}

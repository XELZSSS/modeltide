import { CacheService } from "@/server/infra/cache/service";
import { HttpClient, type ProbeResult } from "@/server/infra/http-client";
import type { AppContext } from "@/server/context";

type HttpInit = Parameters<HttpClient["json"]>[1];
type HttpHandler<T> = (url: string, init?: HttpInit) => T | Promise<T>;
/** url → body. A missing url, or an `Error` value, fails the call like a down leg. */
type HttpRoutes<T> = Record<string, T | Error>;
type HttpRoute<T> = HttpRoutes<T> | HttpHandler<T>;

interface FakeHttpRoutes {
  json?: HttpRoute<unknown>;
  text?: HttpRoute<string>;
  probe?: HttpClient["probe"];
}

/** HTTP double that routes each leg by url table or handler and records `calls`. */
class FakeHttp extends HttpClient {
  /** Every URL asked for, in call order. */
  readonly calls: string[] = [];

  constructor(private readonly routes: FakeHttpRoutes) {
    super();
  }

  override async json<T>(url: string, init?: HttpInit): Promise<T> {
    return (await this.call(this.routes.json, "json", url, init)) as T;
  }

  override async text(url: string, init?: HttpInit): Promise<string> {
    return this.call(this.routes.text, "text", url, init);
  }

  override async probe(url: string): Promise<ProbeResult> {
    this.calls.push(url);
    if (!this.routes.probe) throw new Error(`unexpected probe request to ${url}`);
    return this.routes.probe(url);
  }

  private async call<T>(route: HttpRoute<T> | undefined, kind: string, url: string, init?: HttpInit): Promise<T> {
    this.calls.push(url);
    if (typeof route === "function") return route(url, init);
    const body = route?.[url];
    if (body === undefined) throw new Error(`unexpected ${kind} request to ${url}`);
    if (body instanceof Error) throw body;
    return body as T;
  }
}

export function fakeHttp(routes: FakeHttpRoutes = {}): FakeHttp {
  return new FakeHttp(routes);
}

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

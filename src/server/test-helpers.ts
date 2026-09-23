import { CacheService, resetModuleCachesForTests } from "@/server/infra/cache/service";
import { KvStore } from "@/server/infra/cache/kv";
import { HttpClient, type ProbeResult } from "@/server/infra/http-client";
import type { AppContext } from "@/server/context";
import { resetStatusStoreForTests } from "@/server/sources/status/store";
import { resetUptimeMemoForTests } from "@/server/sources/status/uptime";

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

class FakeHttp extends HttpClient {
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

interface MapKV extends KvStore {
  store: Map<string, string>;
}

export function mapKV(store = new Map<string, string>()): MapKV {
  return Object.assign(
    new KvStore({
      async get(key: string): Promise<string | null> {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string): Promise<void> {
        store.set(key, value);
      },
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
    }),
    { store },
  );
}

interface TestCtxOptions {
  http?: AppContext["http"];
  log?: AppContext["log"];
  version?: string;
}

export function testCtx(
  store = new Map<string, string>(),
  opts: TestCtxOptions = {},
): { ctx: AppContext; kvStore: Map<string, string>; kv: MapKV } {
  const kv = mapKV(store);
  const ctx = {
    cache: new CacheService(kv, opts.version ?? "v-test"),
    http: opts.http ?? ({} as AppContext["http"]),
    kv,
    log: opts.log ?? (() => {}),
  } as AppContext;
  return { ctx, kvStore: store, kv };
}

export function resetAllModuleStateForTests(): void {
  resetModuleCachesForTests();
  resetStatusStoreForTests();
  resetUptimeMemoForTests();
}

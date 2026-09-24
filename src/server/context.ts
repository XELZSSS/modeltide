import { CacheService } from "@/server/infra/cache/service";
import { KvStore } from "@/server/infra/cache/kv";
import { HttpClient } from "@/server/infra/http-client";
import { createLogger, type Logger } from "@/server/infra/logger";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import { SHARED_REFRESH_TIMEOUT_MS } from "@/shared/config/time";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  STATUS_PING_URL?: string;
}

export interface AppContext {
  cache: CacheService;
  refreshContext?: AppContext;
  http: HttpClient;
  kv: KvStore | undefined;
  log: Logger;
  onDetach?: (work: Promise<unknown>) => void;
}

let warnedMissingKv = false;

export function buildContext(
  env: Env,
  init?: {
    workSignal?: AbortSignal;
    callerSignal?: AbortSignal;
    onDetach?: (work: Promise<unknown>) => void;
  },
): AppContext {
  const log = createLogger();
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    log("warn", "[context] CACHE KV not configured: status history is per-isolate memory only");
  }
  const kv = env.CACHE ? new KvStore(env.CACHE) : undefined;
  const cache = new CacheService(kv, CACHE_VERSION, {
    callerSignal: init?.callerSignal,
    onDetach: init?.onDetach,
    log,
  });
  const base: AppContext = {
    cache,
    http: new HttpClient(init?.workSignal ? { signal: init.workSignal } : undefined),
    kv,
    log,
    onDetach: init?.onDetach,
  };
  if (!init?.callerSignal) return base;
  let refresh: AppContext | undefined;
  return {
    ...base,
    get refreshContext(): AppContext {
      refresh ??= {
        ...base,
        cache: new CacheService(kv, CACHE_VERSION, { onDetach: init?.onDetach, log }),
        http: new HttpClient({ signal: AbortSignal.timeout(SHARED_REFRESH_TIMEOUT_MS) }),
      };
      return refresh;
    },
  };
}

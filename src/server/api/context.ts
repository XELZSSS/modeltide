import { CacheService } from "@/server/cache/service";
import { KvStore } from "@/server/cache/kv";
import { HttpClient } from "@/server/upstream/client";
import { logger, type Logger } from "./logger";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";
import { SHARED_REFRESH_TIMEOUT_MS } from "@/server/upstream/timeouts";

export interface Env {
  CACHE?: KVNamespace;
}

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  kv: KvStore | undefined;
  log: Logger;
  onDetach?: (work: Promise<unknown>) => void;
  refreshContext?: AppContext;
}

let warnedMissingKv = false;

export function buildContext(
  env: Env,
  init?: { callerSignal?: AbortSignal; onDetach?: (work: Promise<unknown>) => void },
): AppContext {
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    logger("warn", "[context] CACHE KV not configured: cache is per-isolate memory only");
  }
  const kv = env.CACHE ? new KvStore(env.CACHE) : undefined;
  const cache = new CacheService(kv, CACHE_VERSION, {
    callerSignal: init?.callerSignal,
    onDetach: init?.onDetach,
    log: logger,
  });
  const base: AppContext = {
    cache,
    http: new HttpClient(),
    kv,
    log: logger,
    onDetach: init?.onDetach,
  };
  if (!init?.callerSignal) return base;
  let refresh: AppContext | undefined;
  return {
    ...base,
    get refreshContext(): AppContext {
      refresh ??= {
        ...base,
        cache: new CacheService(kv, CACHE_VERSION, { onDetach: init?.onDetach, log: logger }),
        // Share the base pools: the connection budget is per invocation.
        http: new HttpClient({ signal: AbortSignal.timeout(SHARED_REFRESH_TIMEOUT_MS), pools: base.http.pools }),
      };
      return refresh;
    },
  };
}

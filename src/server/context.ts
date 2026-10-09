import { CacheService } from "@/server/infra/cache/service";
import { KvStore } from "@/server/infra/cache/kv";
import { HttpClient } from "@/server/infra/http-client";
import { logger, type Logger } from "@/server/infra/logger";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import { SHARED_REFRESH_TIMEOUT_MS } from "@/server/config";

export interface Env {
  CACHE?: KVNamespace;
}

export interface AppContext {
  cache: CacheService;
  refreshContext?: AppContext;
  http: HttpClient;
  kv: KvStore | undefined;
  log: Logger;
  onDetach?: (work: Promise<unknown>) => void;
  clock?: () => number;
  random?: () => number;
}

let warnedMissingKv = false;

export function buildContext(
  env: Env,
  init?: {
    workSignal?: AbortSignal;
    callerSignal?: AbortSignal;
    onDetach?: (work: Promise<unknown>) => void;
    fetchImpl?: typeof fetch;
    clock?: () => number;
    random?: () => number;
  },
): AppContext {
  const background = init?.workSignal != null;
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    logger("warn", "[context] CACHE KV not configured: status history is per-isolate memory only");
  }
  const kv = env.CACHE ? new KvStore(env.CACHE) : undefined;
  const cache = new CacheService(kv, CACHE_VERSION, {
    callerSignal: init?.callerSignal,
    onDetach: init?.onDetach,
    log: logger,
  });
  const base: AppContext = {
    cache,
    http: new HttpClient(
      init?.workSignal
        ? { signal: init.workSignal, background, fetchImpl: init.fetchImpl, now: init.clock }
        : { background, fetchImpl: init?.fetchImpl, now: init?.clock },
    ),
    kv,
    log: logger,
    onDetach: init?.onDetach,
    clock: init?.clock,
    random: init?.random,
  };
  if (!init?.callerSignal) return base;
  let refresh: AppContext | undefined;
  return {
    ...base,
    get refreshContext(): AppContext {
      refresh ??= {
        ...base,
        cache: new CacheService(kv, CACHE_VERSION, { onDetach: init?.onDetach, log: logger }),
        // Share the base pools: the platform budget is per invocation, so the
        // foreground client and its background refreshes must draw from one pool.
        http: new HttpClient({ signal: AbortSignal.timeout(SHARED_REFRESH_TIMEOUT_MS), pools: base.http.pools }),
      };
      return refresh;
    },
  };
}

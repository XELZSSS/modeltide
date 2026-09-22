import { CacheService } from "@/server/infra/cache/service";
import { HttpClient } from "@/server/infra/http-client";
import { createLogger, type LogLevel } from "@/server/infra/logger";
import { CACHE_VERSION } from "@/shared/config";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  HF_TOKEN?: string;
  STATUS_PING_URL?: string;
}

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  kv: KVNamespace | undefined;
  hfToken?: string;
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
}

let warnedMissingKv = false;

export function buildContext(
  env: Env,
  init?: {
    /**
     * Server-owned deadline that may cancel shared upstream work. Only the
     * cron builds one; API requests rely on each subrequest's own timeout plus
     * the cache inflight hang guard.
     */
    workSignal?: AbortSignal;
    /**
     * The requesting client's liveness. Never reaches the HttpClient: it only
     * stops this caller from waiting, so one client disconnecting cannot cancel
     * (or fail) a refresh that other callers have joined.
     */
    callerSignal?: AbortSignal;
    /**
     * Keeps an orphaned refresh alive past the request that started it, so an
     * aborted request still leaves the cache warm.
     */
    onDetach?: (work: Promise<unknown>) => void;
  },
): AppContext {
  const log = createLogger();
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    log("warn", "[context] CACHE KV not configured: status history is per-isolate memory only");
  }
  return {
    cache: new CacheService(env.CACHE, CACHE_VERSION, {
      callerSignal: init?.callerSignal,
      onDetach: init?.onDetach,
    }),
    http: new HttpClient(init?.workSignal ? { signal: init.workSignal } : undefined),
    kv: env.CACHE,
    hfToken: env.HF_TOKEN,
    log,
  };
}

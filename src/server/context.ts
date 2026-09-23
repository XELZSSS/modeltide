import { CacheService } from "@/server/infra/cache/service";
import { KvStore } from "@/server/infra/cache/kv";
import { HttpClient } from "@/server/infra/http-client";
import { createLogger, type Logger } from "@/server/infra/logger";
/** Generated from a content hash over the payload-shaping code (see scripts/gen-cache-version.cjs), so a
 * payload-shaping change flips it: payloads under the old prefix are never read, rewritten, or migrated. */
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
}

let warnedMissingKv = false;

export function buildContext(
  env: Env,
  init?: {
    /** Server-owned deadline that may cancel shared upstream work; only the cron builds one. */
    workSignal?: AbortSignal;
    /**
     * Never reaches the HttpClient: it only stops this caller from waiting, so one client
     * disconnecting cannot cancel (or fail) a refresh that other callers have joined.
     */
    callerSignal?: AbortSignal;
    /** Keeps an orphaned refresh alive past the request that started it. */
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
  };
  if (!init?.callerSignal) return base;
  // Lazy: deferring the pair also starts the detached refresh's deadline when the refresh starts.
  let refresh: AppContext | undefined;
  return {
    ...base,
    get refreshContext(): AppContext {
      refresh ??= {
        ...base,
        cache: new CacheService(kv, CACHE_VERSION, { onDetach: init?.onDetach, log }),
        // Keep detached work inside Cloudflare's post-response waitUntil window.
        http: new HttpClient({ signal: AbortSignal.timeout(SHARED_REFRESH_TIMEOUT_MS) }),
      };
      return refresh;
    },
  };
}

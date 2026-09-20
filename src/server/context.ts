import { CacheService } from "@/server/infra/cache-service";
import { HttpClient } from "@/server/infra/http-client";
import { createLogger } from "@/server/infra/logger";
import { CACHE_VERSION } from "@/shared/config";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  HF_TOKEN?: string;
  STATUS_PING_URL?: string;
}

type LogLevel = "info" | "warn" | "error";

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  kv: KVNamespace | undefined;
  hfToken?: string;
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
}

let warnedMissingKv = false;

export function buildContext(env: Env, init?: { signal?: AbortSignal }): AppContext {
  const log = createLogger();
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    log("warn", "[context] CACHE KV not configured: status history is per-isolate memory only");
  }
  return {
    cache: new CacheService(env.CACHE, CACHE_VERSION),
    http: new HttpClient(init?.signal ? { signal: init.signal } : undefined),
    kv: env.CACHE,
    hfToken: env.HF_TOKEN,
    log,
  };
}

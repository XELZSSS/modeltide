import { CacheService } from "@/server/infra/cache-service";
import { HttpClient } from "@/server/infra/http-client";
import { CACHE_VERSION } from "@/shared/config";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  HF_TOKEN?: string;
  WARM_TOKEN?: string;
}

type LogLevel = "info" | "warn" | "error";

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  kv: KVNamespace | undefined;
  hfToken?: string;
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
}

export function sanitizeLogLine(line: string): string {
  const flat = line.replace(/[\r\n]+/g, " ");
  return flat.length > 2000 ? `${flat.slice(0, 2000)}…` : flat;
}

function createLogger(): AppContext["log"] {
  return (level, msg, meta) => {
    let line = msg;
    if (meta) {
      try {
        line = `${msg} ${JSON.stringify(meta)}`;
      } catch {
        line = `${msg} [unserializable meta]`;
      }
    }
    line = sanitizeLogLine(line);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}

let warnedMissingKv = false;

export function buildContext(env: Env, init?: { signal?: AbortSignal }): AppContext {
  const log = createLogger();
  if (!env.CACHE && !warnedMissingKv) {
    warnedMissingKv = true;
    log(
      "warn",
      "[context] CACHE KV not configured: rate limiting disabled (memory fallback), status history is per-isolate memory only",
    );
  }
  return {
    cache: new CacheService(env.CACHE, CACHE_VERSION),
    http: new HttpClient(init?.signal ? { signal: init.signal } : undefined),
    kv: env.CACHE,
    hfToken: env.HF_TOKEN,
    log,
  };
}

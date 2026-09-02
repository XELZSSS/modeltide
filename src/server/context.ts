import { CacheService } from "@/server/infra/cache";
import { HttpClient } from "@/server/infra/http";
import { CACHE_VERSION } from "@/shared/config";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
}

type LogLevel = "info" | "warn" | "error";

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  /** Raw KV binding — undefined when kv_namespaces is not configured */
  kv: KVNamespace | undefined;
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
}

function createLogger(): AppContext["log"] {
  return (level, msg, meta) => {
    const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}

export function buildContext(env: Env): AppContext {
  // CACHE is optional: when kv_namespaces is not configured, env.CACHE is undefined and CacheService bypasses KV
  // Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/
  return {
    cache: new CacheService(env.CACHE, CACHE_VERSION),
    http: new HttpClient(),
    kv: env.CACHE,
    log: createLogger(),
  };
}

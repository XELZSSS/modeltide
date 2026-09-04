import { CacheService, HttpClient } from "@/server/infra";
import { CACHE_VERSION } from "@/shared/config";

export interface Env {
  CACHE?: KVNamespace;
  ASSETS?: Fetcher;
  /** Optional HF API token for authenticated HF requests (higher rate limits). */
  HF_TOKEN?: string;
}

type LogLevel = "info" | "warn" | "error";

export interface AppContext {
  cache: CacheService;
  http: HttpClient;
  /** Raw KV binding — undefined when kv_namespaces is not configured. */
  kv: KVNamespace | undefined;
  hfToken?: string;
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
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
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}

export function buildContext(env: Env): AppContext {
  return {
    cache: new CacheService(env.CACHE, CACHE_VERSION),
    http: new HttpClient(),
    kv: env.CACHE,
    hfToken: env.HF_TOKEN,
    log: createLogger(),
  };
}

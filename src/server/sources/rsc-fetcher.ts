import type { AppContext } from "@/server/context";
import { MAX_JSON_BYTES, UPSTREAM_FETCH_OPTS, upstreamUrl } from "@/server/config";

const DEFAULT_RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

interface RscFetchOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
  retries?: number;
}

export async function fetchRscText(
  ctx: AppContext,
  base: string,
  path: string,
  opts: RscFetchOptions = {},
): Promise<string> {
  return ctx.http.text(
    upstreamUrl(base, path),
    {
      headers: opts.headers ?? { ...DEFAULT_RSC_HEADERS },
      retries: opts.retries ?? UPSTREAM_FETCH_OPTS.retries,
      timeoutMs: UPSTREAM_FETCH_OPTS.timeoutMs,
    },
    opts.maxBytes ?? MAX_JSON_BYTES,
  );
}

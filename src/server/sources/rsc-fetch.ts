import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS } from "@/server/config";

const DEFAULT_RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

export interface RscFetchOptions {
  /** Replaces the default RSC header set entirely when provided. */
  headers?: Record<string, string>;
  maxBytes?: number;
  retries?: number;
}

/** Fetch a Next.js RSC (flight) payload from `base + path` with standard RSC headers. */
export async function fetchRscText(
  ctx: AppContext,
  base: string,
  path: string,
  opts: RscFetchOptions = {},
): Promise<string> {
  return ctx.http.text(
    `${base}${path}`,
    {
      headers: opts.headers ?? { ...DEFAULT_RSC_HEADERS },
      retries: opts.retries,
      timeoutMs: UPSTREAM_FETCH_OPTS.timeoutMs,
    },
    opts.maxBytes,
  );
}

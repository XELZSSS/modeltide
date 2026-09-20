import type { AppContext } from "@/server/context";
import { MAX_JSON_BYTES, UPSTREAM_FETCH_OPTS } from "@/server/config";
import { errMsg } from "@/server/infra/pool";
import { parseRscPayload } from "@/server/parsers/rsc";

const DEFAULT_RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

export interface RscFetchOptions {
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
    `${base}${path}`,
    {
      headers: opts.headers ?? { ...DEFAULT_RSC_HEADERS },
      retries: opts.retries ?? UPSTREAM_FETCH_OPTS.retries,
      timeoutMs: UPSTREAM_FETCH_OPTS.timeoutMs,
    },
    opts.maxBytes ?? MAX_JSON_BYTES,
  );
}

export interface RscArrayOptions<T> extends RscFetchOptions {
  label: string;
  marker: string;
  extract: (tree: unknown) => T[] | null;
  map?: (arr: T[]) => T[];
  logPrefix?: string;
}

export async function fetchRscArrayLenient<T>(
  ctx: AppContext,
  base: string,
  path: string,
  opts: RscArrayOptions<T>,
): Promise<T[]> {
  let body: string | null;
  try {
    body = await fetchRscText(ctx, base, path, opts);
  } catch (err) {
    ctx.log("warn", `${opts.logPrefix ?? ""} ${opts.label} enrichment failed: ${errMsg(err)}`);
    return [];
  }
  try {
    const arr = parseRscPayload<T>(body, opts.marker, opts.extract);
    return opts.map ? opts.map(arr) : arr;
  } catch (err) {
    ctx.log("warn", `${opts.logPrefix ?? ""} ${opts.label} enrichment parse failed: ${errMsg(err)}`);
    return [];
  }
}

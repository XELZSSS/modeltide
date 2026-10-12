import type { AppContext } from "@/server/context";
import { MAX_JSON_BYTES, upstreamUrl } from "@/server/config/upstream";
import { fetchPolicy } from "@/server/config/fetch-policies";

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
  if (opts.headers == null && opts.retries == null) {
    return ctx.http.getRsc(base, path, opts.maxBytes ?? MAX_JSON_BYTES);
  }
  const policy = fetchPolicy("rsc");
  return ctx.http.text(
    upstreamUrl(base, path),
    {
      headers: opts.headers ?? { RSC: "1" },
      retries: opts.retries ?? policy.retries,
      timeoutMs: policy.timeoutMs,
    },
    opts.maxBytes ?? MAX_JSON_BYTES,
  );
}

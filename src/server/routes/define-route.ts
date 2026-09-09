import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { ApiError } from "@/server/infra/errors";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "@/server/infra/validation";
import type { AppContext } from "@/server/context";
import { BROWSER_CACHE_HEADER, BROWSER_NO_STORE_HEADER, CDN_CACHE_HEADER, CDN_NO_STORE_HEADER } from "@/server/config";
import { applyApiHeaders } from "@/shared/config/security";

function applyCacheHeaders(h: Headers, noStore: boolean, override?: { browser: string; cdn: string }): void {
  if (override) {
    h.set("Cache-Control", override.browser);
    h.set("CDN-Cache-Control", override.cdn);
  } else {
    h.set("Cache-Control", noStore ? BROWSER_NO_STORE_HEADER : BROWSER_CACHE_HEADER);
    h.set("CDN-Cache-Control", noStore ? CDN_NO_STORE_HEADER : CDN_CACHE_HEADER);
  }
  h.set("Vary", "Accept-Encoding");
}

function clampStatus(status: number): number {
  return status >= 100 && status < 600 ? status : 500;
}

function errorHeaders(): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  applyApiHeaders(headers);
  return headers;
}

function collectQueryParams(url: URL): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    const existing = raw[key];
    if (existing === undefined) raw[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else raw[key] = [existing, value];
  });
  return raw;
}

function isTimeoutLike(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(err.message));
}

function timeoutResponse(): Response {
  return Response.json(
    { error: { code: 504, message: "Upstream request timed out" } },
    { status: 504, headers: errorHeaders() },
  );
}

function mapApiError(err: unknown, method: string, path: string): Response {
  if (isTimeoutLike(err)) return timeoutResponse();
  if (err instanceof ApiError) {
    const status = clampStatus(err.status);
    const headers = errorHeaders();
    if (status === 504 || (err.name === "UpstreamError" && (err as { causedByTimeout?: boolean }).causedByTimeout)) {
      console.warn(`[upstream-timeout] ${method} ${path} ${err.message}`);
      return timeoutResponse();
    }
    if (status === 502) {
      console.warn(`[upstream] ${method} ${path} ${err.message}`);
      return Response.json(
        { error: { code: status, message: "Upstream data source temporarily unavailable" } },
        { status, headers },
      );
    }
    return Response.json({ error: { code: status, message: err.message } }, { status, headers });
  }
  console.error(`[unhandled] ${method} ${path} ${err instanceof Error ? err.message : String(err)}`);
  return Response.json(
    { error: { code: 500, message: "Internal server error" } },
    { status: 500, headers: errorHeaders() },
  );
}

export interface ApiRouteDef<S extends QuerySchema = QuerySchema> {
  query?: S;
  noStore?: boolean;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

/**
 * Shared GET handler for all /api/* endpoints:
 * buildContext -> validateQuery -> handler -> cache headers -> {data}
 * Bindings come straight from the Worker entrypoint (env.CACHE, env.HF_TOKEN).
 */
export async function handleApiRoute<S extends QuerySchema>(
  req: Request,
  env: Env,
  path: string,
  def: ApiRouteDef<S>,
): Promise<Response> {
  try {
    const url = new URL(req.url);

    const context = buildContext(env, { signal: req.signal });
    const params = validateQuery(collectQueryParams(url), (def.query ?? {}) as S);
    const data = await def.handler(context, params);
    const headers = new Headers({ "content-type": "application/json" });
    applyCacheHeaders(headers, def.noStore === true, def.cache);
    applyApiHeaders(headers);
    return Response.json({ data }, { headers });
  } catch (err) {
    return mapApiError(err, req.method, path);
  }
}

export function handleOptions(): Response {
  const headers = new Headers();
  applyApiHeaders(headers);
  return new Response(null, { status: 204, headers });
}

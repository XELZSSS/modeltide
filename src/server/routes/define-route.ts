import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { ApiError, ClientAbortError } from "@/server/infra/errors";
import { isTimeoutLike } from "@/server/infra/http-error";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "@/server/infra/validation";
import type { AppContext } from "@/server/context";
import { BROWSER_CACHE_HEADER, BROWSER_NO_STORE_HEADER, CDN_CACHE_HEADER, CDN_NO_STORE_HEADER } from "@/server/config";
import { applyApiHeaders } from "@/shared/config/security";

function applyCacheHeaders(h: Headers, override?: { browser: string; cdn: string }): void {
  if (override) {
    h.set("Cache-Control", override.browser);
    h.set("CDN-Cache-Control", override.cdn);
  } else {
    h.set("Cache-Control", BROWSER_CACHE_HEADER);
    h.set("CDN-Cache-Control", CDN_CACHE_HEADER);
  }
  h.set("Vary", "Accept-Encoding");
}

function clampStatus(status: number): number {
  // `new Response` accepts only 200-599: clamp or a RangeError escapes the catch.
  return status >= 200 && status < 600 ? status : 500;
}

function errorHeaders(): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "Cache-Control": BROWSER_NO_STORE_HEADER,
    "CDN-Cache-Control": CDN_NO_STORE_HEADER,
  });
  applyApiHeaders(headers);
  return headers;
}

function collectQueryParams(url: URL): Record<string, string | string[]> {
  // Null-prototype: `?__proto__=x` would otherwise rewrite this object's prototype.
  const raw: Record<string, string | string[]> = Object.create(null) as Record<string, string | string[]>;
  url.searchParams.forEach((value, key) => {
    const existing = Object.hasOwn(raw, key) ? raw[key] : undefined;
    if (existing === undefined) raw[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else raw[key] = [existing, value];
  });
  return raw;
}

export function timeoutResponse(): Response {
  return Response.json(
    { error: { code: 504, message: "Upstream request timed out" } },
    { status: 504, headers: errorHeaders() },
  );
}

export function methodNotAllowedResponse(): Response {
  const res = Response.json(
    { error: { code: 405, message: "Method not allowed" } },
    { status: 405, headers: { "content-type": "application/json" } },
  );
  applyApiHeaders(res.headers);
  return res;
}

export function notFoundResponse(): Response {
  const res = Response.json(
    { error: { code: 404, message: "Not found" } },
    { status: 404, headers: { "content-type": "application/json" } },
  );
  applyApiHeaders(res.headers);
  return res;
}

export function stripBodyForHead(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(null, { status: res.status, headers });
}

function mapApiError(err: unknown, method: string, path: string): Response {
  if (err instanceof ClientAbortError) {
    const headers = errorHeaders();
    return new Response(null, { status: 499, headers });
  }
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
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

export async function handleApiRoute<S extends QuerySchema>(
  req: Request,
  env: Env,
  path: string,
  def: ApiRouteDef<S>,
): Promise<Response> {
  try {
    const url = new URL(req.url);

    const context = buildContext(env, { callerSignal: req.signal });
    const rawParams = collectQueryParams(url);
    const schemaKeys = new Set(Object.keys(def.query ?? {}));
    const unknownKeys = Object.keys(rawParams).filter((k) => !schemaKeys.has(k));
    if (unknownKeys.length > 0) {
      context.log("warn", `[query] ${path} ignoring unknown params: ${unknownKeys.join(", ")}`);
    }
    const params = validateQuery(rawParams, (def.query ?? {}) as S);
    const data = await def.handler(context, params);
    const headers = new Headers({ "content-type": "application/json" });
    applyCacheHeaders(headers, def.cache);
    applyApiHeaders(headers);
    return Response.json({ data }, { headers });
  } catch (err) {
    return mapApiError(err, req.method, path);
  }
}

import { buildContext, type AppContext, type Env } from "./context";
import { ApiError, ClientAbortError, UpstreamError, errMsg, isTimeoutLike, ValidationError } from "./errors";
import { logger } from "./logger";
import { serializedBodyOf } from "@/server/serialized-body";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "./validation";
import type { ApiDomain, DomainPayload } from "@/shared/contract";
import { API_VERSION_PARAM } from "@/shared/config/api";
import {
  type CacheDurations,
  type CacheSpec,
  BROWSER_NO_STORE_HEADER,
  CDN_NO_STORE_HEADER,
  applyApiHeaders,
  ifNoneMatchSatisfied,
  payloadEtag,
  renderCacheSpec,
  renderPartialCacheSpec,
} from "./headers";

const UNKNOWN_PARAM_MAX_SHOWN = 5;

function applyCacheHeaders(h: Headers, spec: CacheSpec): void {
  h.set("Cache-Control", spec.browser);
  h.set("CDN-Cache-Control", spec.cdn);
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
  const raw: Record<string, string | string[]> = Object.create(null) as Record<string, string | string[]>;
  url.searchParams.forEach((value, key) => {
    const existing = Object.hasOwn(raw, key) ? raw[key] : undefined;
    if (existing === undefined) raw[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else raw[key] = [existing, value];
  });
  return raw;
}

function errorJson(status: number, message: string): Response {
  return Response.json({ error: { code: status, message } }, { status, headers: errorHeaders() });
}

function timeoutResponse(): Response {
  return errorJson(504, "Upstream request timed out");
}

const RATE_LIMIT_FALLBACK_S = 60;

function rateLimitedResponse(retryAfterMs: number | undefined): Response {
  const seconds = retryAfterMs == null ? RATE_LIMIT_FALLBACK_S : Math.max(1, Math.ceil(retryAfterMs / 1000));
  const res = errorJson(503, "Upstream rate limited, retry shortly");
  res.headers.set("Retry-After", String(seconds));
  return res;
}

export function methodNotAllowedResponse(): Response {
  const res = errorJson(405, "Method not allowed");
  res.headers.set("Allow", "GET, HEAD");
  return res;
}

export function notFoundResponse(): Response {
  return errorJson(404, "Not found");
}

export function stripBodyForHead(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(null, { status: res.status, headers });
}

function mapApiError(err: unknown, method: string, path: string, clientAborted: boolean): Response {
  if (clientAborted || err instanceof ClientAbortError) {
    return errorJson(499, "Client closed request");
  }
  if (isTimeoutLike(err)) {
    logger("warn", `[upstream-timeout] ${method} ${path} ${errMsg(err)}`);
    return timeoutResponse();
  }
  if (err instanceof UpstreamError && err.statusCode === 429) {
    logger("warn", `[upstream-rate-limit] ${method} ${path} retryAfterMs=${err.retryAfterMs ?? "none"}`);
    return rateLimitedResponse(err.retryAfterMs);
  }
  if (err instanceof ApiError) {
    // Every ApiError subclass is constructed with a 4xx/5xx status (400 validation, 499 caller abort, 502 upstream,
    // 504 timeout), so the status is used as-is.
    if (err.status === 502) {
      const origin = err instanceof UpstreamError && err.statusCode != null ? ` (upstream ${err.statusCode})` : "";
      logger("warn", `[upstream] ${method} ${path} ${err.message}${origin}`);
      return errorJson(502, "Upstream data source temporarily unavailable");
    }
    return errorJson(err.status, err.message);
  }
  logger("error", `[unhandled] ${method} ${path} ${errMsg(err)}`);
  return errorJson(500, "Internal server error");
}

export interface ApiRouteDef<D extends ApiDomain = ApiDomain, S extends QuerySchema = QuerySchema> {
  query?: S;
  /** How long this route's payload may be kept. The router renders it into the browser and edge headers. */
  cache: CacheDurations;
  /**
   * Per-payload override of `cache`. A source that answers an empty list for a miss (the Hugging Face by-id lookup)
   * would otherwise hand the route's multi-hour TTL to a payload it only keeps for a minute, so it leaves out
   * `staleIfErrorS` as well: "not found" must not be pinnable at the edge.
   */
  cacheFor?(payload: DomainPayload<D>): CacheDurations | undefined;
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<DomainPayload<D>>;
}

export async function handleApiRoute<D extends ApiDomain, S extends QuerySchema>(
  req: Request,
  env: Env,
  url: URL,
  def: ApiRouteDef<D, S>,
  hooks?: { onDetach?: (work: Promise<unknown>) => void },
): Promise<Response> {
  const path = url.pathname;
  try {
    const context = buildContext(env, { callerSignal: req.signal, onDetach: hooks?.onDetach });
    const rawParams = collectQueryParams(url);
    // `def.query` is optional on the route definition; a route without a schema accepts no params, which is what the
    // empty object says. Both uses read it once, so the default is applied here rather than at each site.
    const schema = def.query ?? {};
    const schemaKeys = new Set(Object.keys(schema));
    const unknownKeys = Object.keys(rawParams).filter((k) => !schemaKeys.has(k) && k !== API_VERSION_PARAM);
    if (unknownKeys.length > 0) {
      const shown = unknownKeys
        .slice(0, UNKNOWN_PARAM_MAX_SHOWN)
        .map((key) => key.replace(/\p{C}/gu, ""))
        .join(", ");
      throw new ValidationError(`Unknown query param(s): ${shown}`);
    }
    const params = validateQuery(rawParams, schema as S);
    const payload = await def.handler(context, params);
    const headers = new Headers({ "content-type": "application/json" });
    const durations = def.cacheFor?.(payload) ?? def.cache;
    // A partial payload is held for less time, and `renderPartialCacheSpec` decides how much less. The route's
    // stale-if-error decision comes along unchanged, so a miss that must not be pinned at the edge stays unpinnable
    // after it degrades too.
    applyCacheHeaders(headers, payload.partial ? renderPartialCacheSpec(durations) : renderCacheSpec(durations));
    applyApiHeaders(headers);
    // Every route's spec renders a `public` header, so a payload that got here is always cacheable and there is no
    // `no-store` response whose validator would have to be skipped.
    const etag = payloadEtag(payload.fetchedAt, {
      rows: Array.isArray(payload.data) ? payload.data.length : undefined,
      partial: payload.partial,
    });
    headers.set("ETag", etag);
    if (ifNoneMatchSatisfied(req.headers.get("if-none-match"), etag)) {
      headers.delete("content-type");
      return new Response(null, { status: 304, headers });
    }
    if (req.method === "HEAD") return new Response(null, { headers });
    // The cache stored this payload together with its encoded body, so a hit serves the bytes it already holds. Only a
    // payload that never went through the cache (a degraded copy, a route handler in tests) is encoded here.
    return new Response(serializedBodyOf(payload) ?? JSON.stringify(payload), { headers });
  } catch (err) {
    return mapApiError(err, req.method, path, req.signal.aborted);
  }
}

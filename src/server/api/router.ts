import { buildContext, type AppContext, type Env } from "./context";
import { ApiError, ClientAbortError, UpstreamError, errMsg, isTimeoutLike, ValidationError } from "./errors";
import { logger } from "./logger";
import type { ServedPayload } from "@/server/served-payload";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "./validation";
import type { ApiDomain, DomainPayload, PayloadOf } from "@/shared/contract";
import type { ApiErrorBody, ApiErrorKind } from "@/shared/types/api-error";
import { defaultApiErrorKind } from "@/shared/types/api-error";
import { API_VERSION_PARAM, MAX_ID_CHARS } from "@/shared/config/api";
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

interface ErrorDetail {
  /** The route whose source failed; absent for a request that never reached one. */
  source?: ApiDomain;
  upstreamStatus?: number;
}

function errorJson(status: number, kind: ApiErrorKind, message: string, detail?: ErrorDetail): Response {
  const body: ApiErrorBody = { error: { code: status, kind, message, ...detail } };
  return Response.json(body, { status, headers: errorHeaders() });
}

const RATE_LIMIT_FALLBACK_S = 60;

function rateLimitedResponse(retryAfterMs: number | undefined, source: ApiDomain): Response {
  const seconds = retryAfterMs == null ? RATE_LIMIT_FALLBACK_S : Math.max(1, Math.ceil(retryAfterMs / 1000));
  // 429 is the one failure where the upstream unambiguously answered, so it carries its status like the 502 path does:
  // the client shows "upstream 429" under the rate-limit notice.
  const res = errorJson(503, "rate-limited", "Upstream rate limited, retry shortly", { source, upstreamStatus: 429 });
  res.headers.set("Retry-After", String(seconds));
  return res;
}

export function methodNotAllowedResponse(): Response {
  const res = errorJson(405, "method-not-allowed", "Method not allowed");
  res.headers.set("Allow", "GET, HEAD");
  return res;
}

export function notFoundResponse(): Response {
  return errorJson(404, "not-found", "Not found");
}

export function stripBodyForHead(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(null, { status: res.status, headers });
}

/** `source` always; `upstreamStatus` only when an upstream actually answered. */
function upstreamDetail(err: unknown, source: ApiDomain): ErrorDetail {
  return err instanceof UpstreamError && err.statusCode != null
    ? { source, upstreamStatus: err.statusCode }
    : { source };
}

function mapApiError(err: unknown, method: string, path: string, clientAborted: boolean, source: ApiDomain): Response {
  if (clientAborted || err instanceof ClientAbortError) {
    return errorJson(499, "client-abort", "Client closed request", { source });
  }
  if (isTimeoutLike(err)) {
    logger("warn", `[upstream-timeout] ${method} ${path} ${errMsg(err)}`);
    return errorJson(504, "timeout", "Upstream request timed out", upstreamDetail(err, source));
  }
  if (err instanceof UpstreamError && err.statusCode === 429) {
    logger("warn", `[upstream-rate-limit] ${method} ${path} retryAfterMs=${err.retryAfterMs ?? "none"}`);
    return rateLimitedResponse(err.retryAfterMs, source);
  }
  if (err instanceof ApiError) {
    // Every ApiError subclass is constructed with a 4xx/5xx status (400 validation, 499 caller abort, 502 upstream,
    // 504 timeout), so the status is used as-is.
    if (err.status === 502) {
      const detail = upstreamDetail(err, source);
      const origin = detail.upstreamStatus === undefined ? "" : ` (upstream ${detail.upstreamStatus})`;
      logger("warn", `[upstream] ${method} ${path} ${err.message}${origin}`);
      return errorJson(502, "upstream-unavailable", "Upstream data source temporarily unavailable", detail);
    }
    return errorJson(err.status, defaultApiErrorKind(err.status), err.message, { source });
  }
  logger("error", `[unhandled] ${method} ${path} ${errMsg(err)}`);
  return errorJson(500, "internal", "Internal server error", { source });
}

export interface ApiRouteDef<D extends ApiDomain = ApiDomain, S extends QuerySchema = QuerySchema> {
  /** Which payload this route serves; carried into every error it answers so the client can name the source. */
  readonly domain: D;
  query?: S;
  /** How long this route's payload may be kept. The router renders it into the browser and edge headers. */
  cache: CacheDurations;
  /**
   * Per-payload override of `cache`. A source that answers an empty list for a miss (the Hugging Face by-id lookup)
   * would otherwise hand the route's multi-hour TTL to a payload it only keeps for a minute, so it leaves out
   * `staleIfErrorS` as well: "not found" must not be pinnable at the edge.
   */
  cacheFor?(payload: DomainPayload<D>): CacheDurations | undefined;
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<ServedPayload<PayloadOf<D>>>;
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
    // `?v=` carries the client's cache version and is deliberately outside the route's schema, but it is still a query
    // param the client chooses: an unbounded one would be echoed into logs and cache keys, so it is bounded like any other.
    const version = rawParams[API_VERSION_PARAM];
    if (version !== undefined) {
      if (Array.isArray(version)) throw new ValidationError(`Query param "${API_VERSION_PARAM}" must not be repeated`);
      if (version.length > MAX_ID_CHARS) throw new ValidationError(`Query param "${API_VERSION_PARAM}" is too long`);
    }
    const unknownKeys = Object.keys(rawParams).filter((k) => !schemaKeys.has(k) && k !== API_VERSION_PARAM);
    if (unknownKeys.length > 0) {
      const shown = unknownKeys
        .slice(0, UNKNOWN_PARAM_MAX_SHOWN)
        .map((key) => key.replace(/\p{C}/gu, ""))
        .join(", ");
      throw new ValidationError(`Unknown query param(s): ${shown}`);
    }
    const params = validateQuery(rawParams, schema as S);
    const answer = await def.handler(context, params);
    const payload = answer.payload;
    const headers = new Headers({ "content-type": "application/json" });
    const durations = def.cacheFor?.(payload) ?? def.cache;
    // A partial payload is held for less time, and `renderPartialCacheSpec` decides how much less. The route's
    // stale-if-error decision comes along unchanged, so a miss that must not be pinned at the edge stays unpinnable
    // after it degrades too.
    applyCacheHeaders(headers, payload.partial ? renderPartialCacheSpec(durations) : renderCacheSpec(durations));
    applyApiHeaders(headers);
    // Every route's spec renders a `public` header, so a payload that got here is always cacheable and there is no
    // `no-store` response whose validator would have to be skipped.
    // A payload the cache did not produce (a test handler) carries no stamp; a fresh one costs a 304, never a body.
    // A payload the cache did not produce (a test handler) carries no stamp; a fresh one costs a 304, never a body.
    const etag = payloadEtag(new Date(answer.producedAt ?? Date.now()).toISOString(), {
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
    return new Response(answer.body ?? JSON.stringify(payload), { headers });
  } catch (err) {
    const res = mapApiError(err, req.method, path, req.signal.aborted, def.domain);
    // A HEAD response carries no body, error or not: the success path above already answers with `null`, and the
    // entry point does the same for a 404.
    return req.method === "HEAD" ? stripBodyForHead(res) : res;
  }
}

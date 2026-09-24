import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { UNKNOWN_QUERY_WARN_THROTTLE_MS, throttleGate } from "@/server/config/status";
import { ApiError, ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/infra/errors";
import { logger, type Logger } from "@/server/infra/logger";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "@/server/infra/query-validation";
import type { AppContext } from "@/server/context";
import type { SourcePayload } from "@/shared/types";
import { API_VERSION_PARAM } from "@/shared/config/paths";
import {
  BROWSER_CACHE_HEADER,
  BROWSER_NO_STORE_HEADER,
  CDN_CACHE_HEADER,
  CDN_NO_STORE_HEADER,
  PARTIAL_CACHE_HEADERS,
  applyApiHeaders,
  ifNoneMatchSatisfied,
  payloadEtag,
} from "@/server/http/headers";

function applyCacheHeaders(h: Headers, override?: { browser: string; cdn: string }): string {
  const browser = override?.browser ?? BROWSER_CACHE_HEADER;
  h.set("Cache-Control", browser);
  h.set("CDN-Cache-Control", override?.cdn ?? CDN_CACHE_HEADER);
  return browser;
}

function clampStatus(status: number): number {
  return status >= 200 && status < 600 && status !== 204 && status !== 205 && status !== 304 ? status : 500;
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

const MAX_LOGGED_UNKNOWN_PARAMS = 5;

function loggableParamName(key: string): string {
  return key.replace(/\p{C}/gu, "").slice(0, 64);
}

const unknownParamWarnGates = new Map<string, ReturnType<typeof throttleGate>>();

function warnUnknownParams(log: Logger, path: string, unknownKeys: string[]): void {
  let gate = unknownParamWarnGates.get(path);
  if (!gate) {
    gate = throttleGate(UNKNOWN_QUERY_WARN_THROTTLE_MS);
    unknownParamWarnGates.set(path, gate);
  }
  if (!gate.open()) return;
  const shown = unknownKeys.slice(0, MAX_LOGGED_UNKNOWN_PARAMS).map(loggableParamName).join(", ");
  const truncated = unknownKeys.length > MAX_LOGGED_UNKNOWN_PARAMS ? " …" : "";
  log("warn", `[query] ${path} ignoring unknown params: ${shown}${truncated}`);
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

export function methodNotAllowedResponse(): Response {
  const res = errorJson(405, "Method not allowed");
  res.headers.set("Allow", "GET, HEAD, OPTIONS");
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

function mapApiError(err: unknown, method: string, path: string): Response {
  if (err instanceof ClientAbortError) {
    return errorJson(499, "Client closed request");
  }
  if (isTimeoutLike(err)) {
    logger("warn", `[upstream-timeout] ${method} ${path} ${err instanceof Error ? err.message : String(err)}`);
    return timeoutResponse();
  }
  if (err instanceof ApiError) {
    const status = clampStatus(err.status);
    if (status === 502) {
      const origin = err instanceof UpstreamError && err.statusCode != null ? ` (upstream ${err.statusCode})` : "";
      logger("warn", `[upstream] ${method} ${path} ${err.message}${origin}`);
      return errorJson(502, "Upstream data source temporarily unavailable");
    }
    return errorJson(status, err.message);
  }
  logger("error", `[unhandled] ${method} ${path} ${err instanceof Error ? err.message : String(err)}`);
  return errorJson(500, "Internal server error");
}

interface ApiRouteDef<S extends QuerySchema = QuerySchema> {
  query?: S;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<SourcePayload<unknown>>;
}

export async function handleApiRoute<S extends QuerySchema>(
  req: Request,
  env: Env,
  path: string,
  def: ApiRouteDef<S>,
  hooks?: { onDetach?: (work: Promise<unknown>) => void },
): Promise<Response> {
  try {
    const url = new URL(req.url);

    const context = buildContext(env, { callerSignal: req.signal, onDetach: hooks?.onDetach });
    const rawParams = collectQueryParams(url);
    const schemaKeys = new Set(Object.keys(def.query ?? {}));
    const unknownKeys = Object.keys(rawParams).filter((k) => !schemaKeys.has(k) && k !== API_VERSION_PARAM);
    if (unknownKeys.length > 0) warnUnknownParams(context.log, path, unknownKeys);
    const params = validateQuery(rawParams, (def.query ?? {}) as S);
    const payload = await def.handler(context, params);
    const headers = new Headers({ "content-type": "application/json" });
    const browserCache = applyCacheHeaders(
      headers,
      def.cache ?? (payload.partial === true ? PARTIAL_CACHE_HEADERS : undefined),
    );
    applyApiHeaders(headers);
    if (!browserCache.includes("no-store")) {
      const etag = payloadEtag(payload.fetchedAt);
      headers.set("ETag", etag);
      if (ifNoneMatchSatisfied(req.headers.get("if-none-match"), etag)) {
        headers.delete("content-type");
        return new Response(null, { status: 304, headers });
      }
    }
    return req.method === "HEAD" ? new Response(null, { headers }) : Response.json(payload, { headers });
  } catch (err) {
    return mapApiError(err, req.method, path);
  }
}

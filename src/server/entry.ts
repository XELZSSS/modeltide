import type { Env } from "./api/context";
import { applyApiHeaders } from "./api/headers";
import { handleApiRoute, methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "./api/router";
import { SOURCES } from "./registry";

type RouteEntry = (typeof SOURCES)[number];

const ROUTES = new Map<string, RouteEntry>(SOURCES.map((source) => [source.path, source]));

function normalizePathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  // The route table is keyed by exact path, so a trailing slash would 404.
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function resolveRoute(pathname: string): RouteEntry | undefined {
  return ROUTES.get(pathname);
}

function optionsResponse(): Response {
  const res = new Response(null, { status: 204 });
  res.headers.set("Allow", "GET, HEAD, OPTIONS");
  applyApiHeaders(res.headers);
  return res;
}

function methodResponse(method: string): Response | null {
  if (method === "OPTIONS") return optionsResponse();
  if (method !== "GET" && method !== "HEAD") return methodNotAllowedResponse();
  return null;
}

function notFoundForMethod(method: string): Response {
  const res = notFoundResponse();
  return method === "HEAD" ? stripBodyForHead(res) : res;
}

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil?: (work: Promise<unknown>) => void;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const route = resolveRoute(normalizePathname(url.pathname));
  if (!route) return notFoundForMethod(request.method);
  const early = methodResponse(request.method);
  if (early) return early;
  const onDetach = context.waitUntil ? (work: Promise<unknown>) => context.waitUntil?.(work) : undefined;
  return handleApiRoute(request, env, url, route, onDetach ? { onDetach } : undefined);
}

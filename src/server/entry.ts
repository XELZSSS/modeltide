import type { Env } from "./api/context";
import { handleApiRoute, methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "./api/router";
import { SOURCES } from "./registry";

type RouteEntry = (typeof SOURCES)[number];

const ROUTES = new Map<string, RouteEntry>(SOURCES.map((source) => [source.path, source]));

function normalizePathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function resolveRoute(pathname: string): RouteEntry | undefined {
  return ROUTES.get(pathname);
}

function methodResponse(method: string): Response | null {
  return method === "GET" || method === "HEAD" ? null : methodNotAllowedResponse();
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

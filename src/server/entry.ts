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
  const route = ROUTES.get(normalizePathname(url.pathname));
  if (!route) return notFoundForMethod(request.method);
  const early = methodResponse(request.method);
  if (early) return early;
  const waitUntil = context.waitUntil;
  // `waitUntil` keeps a detached cache refresh alive after the response is sent. Where the host does not provide it,
  // the same work still runs — nothing just waits for it.
  const hooks = waitUntil === undefined ? undefined : { onDetach: (work: Promise<unknown>) => waitUntil(work) };
  return handleApiRoute(request, env, url, route, hooks);
}

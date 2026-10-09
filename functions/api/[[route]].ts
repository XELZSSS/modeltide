import type { Env } from "@/server/context";
import { applyApiHeaders } from "@/server/http/headers";
import {
  handleApiRoute,
  methodNotAllowedResponse,
  notFoundResponse,
  stripBodyForHead,
} from "@/server/routes/define-route";
import { SOURCES } from "@/server/sources/registry";

export type RouteEntry = (typeof SOURCES)[number];

const ROUTES = new Map<string, RouteEntry>(SOURCES.map((source) => [source.path, source]));

export function resolveRoute(pathname: string): RouteEntry | undefined {
  return ROUTES.get(pathname);
}

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil?: (work: Promise<unknown>) => void;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const route = resolveRoute(url.pathname);
  const isHead = request.method === "HEAD";
  if (!route) return isHead ? stripBodyForHead(notFoundResponse()) : notFoundResponse();
  if (request.method === "OPTIONS") {
    const res = new Response(null, { status: 204 });
    res.headers.set("Allow", "GET, HEAD, OPTIONS");
    applyApiHeaders(res.headers);
    return res;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowedResponse();
  }
  const onDetach = context.waitUntil ? (work: Promise<unknown>) => context.waitUntil?.(work) : undefined;
  return handleApiRoute(request, env, url, route, onDetach ? { onDetach } : undefined);
}

import type { Env } from "@/server/context";
import { handleApiRoute } from "@/server/routes/define-route";
import { methodResponse, notFoundForMethod } from "@/server/routes/http";
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
  if (!route) return notFoundForMethod(request.method);
  const early = methodResponse(request.method);
  if (early) return early;
  const onDetach = context.waitUntil ? (work: Promise<unknown>) => context.waitUntil?.(work) : undefined;
  return handleApiRoute(request, env, url, route, onDetach ? { onDetach } : undefined);
}

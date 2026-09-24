import type { Env } from "@/server/context";
import { handleApiRoute } from "@/server/routes/define-route";
import { SOURCES } from "@/server/sources/registry";

export type RouteEntry = (typeof SOURCES)[number];

const ROUTES = new Map<string, RouteEntry>(SOURCES.map((source) => [source.path, source]));

export function resolveRoute(pathname: string): RouteEntry | undefined {
  return ROUTES.get(pathname);
}

export function handleApi(
  req: Request,
  env: Env,
  url: URL,
  route: RouteEntry,
  onDetach?: (work: Promise<unknown>) => void,
): Promise<Response> {
  return handleApiRoute(req, env, url.pathname, route, onDetach ? { onDetach } : undefined);
}

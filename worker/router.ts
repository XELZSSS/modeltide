import type { Env } from "@/server/context";
import { handleApiRoute, type ApiRouteDef } from "@/server/routes/define-route";
import { SOURCES } from "@/server/sources/registry";

interface ApiRoute {
  path: string;
  def: ApiRouteDef;
}

/**
 * HTTP route table transcribed from the single source manifest. The same
 * entries drive the cron warmup list (see worker/index.ts), so endpoints and
 * warmup targets can no longer drift apart.
 */
const API_ROUTES: readonly ApiRoute[] = SOURCES.map((source) => ({
  path: source.path,
  def: { query: source.query, cache: source.cache, handler: source.handler },
}));

/**
 * Dispatch /api requests to the matching route. Returns undefined when no
 * route matches so the entrypoint can render its own 404.
 */
export function handleApi(req: Request, env: Env, url: URL): Promise<Response> | undefined {
  const route = API_ROUTES.find((r) => r.path === url.pathname);
  if (!route) return undefined;
  return handleApiRoute(req, env, url.pathname, route.def);
}

import type { Env } from "@/server/context";
import { handleApiRoute } from "@/server/routes/define-route";
import { SOURCES } from "@/server/sources/registry";

/**
 * Dispatch /api requests to the matching source-manifest entry. The manifest
 * itself is the route table (see worker/index.ts for the cron warmup list built
 * from the same entries), so endpoints and warmup targets cannot drift apart.
 * Returns undefined when no route matches so the entrypoint can render its 404.
 */
export function handleApi(req: Request, env: Env, url: URL): Promise<Response> | undefined {
  const source = SOURCES.find((s) => s.path === url.pathname);
  if (!source) return undefined;
  return handleApiRoute(req, env, url.pathname, source);
}

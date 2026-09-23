import type { Env } from "@/server/context";
import { handleApiRoute } from "@/server/routes/define-route";
import { SOURCES } from "@/server/sources/registry";

// SOURCES is the route table; undefined means no route matched and the entrypoint renders its 404.
export function handleApi(
  req: Request,
  env: Env,
  url: URL,
  onDetach?: (work: Promise<unknown>) => void,
): Promise<Response> | undefined {
  const source = SOURCES.find((s) => s.path === url.pathname);
  if (!source) return undefined;
  return handleApiRoute(req, env, url.pathname, source, onDetach ? { onDetach } : undefined);
}

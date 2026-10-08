import type { Env } from "@/server/context";
import { PING_TIMEOUT_MS } from "@/server/config";
import { API_PREFIX } from "@/shared/config";
import { STATIC_FILE_RE } from "@/shared/config/paths";
import { errMsg } from "@/shared/utils";
import { logger } from "@/server/infra/logger";
import { methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "@/server/routes/define-route";
import { scheduledTask } from "@/server/cron/scheduled-task";
import { handleApi, resolveRoute } from "./api-router";

export { cronHealthy, warmRoundOutcome, type ScheduledResult } from "@/server/cron/scheduled-task";

export function failTarget(url: string): string {
  const cut = [url.indexOf("?"), url.indexOf("#")].filter((i) => i >= 0);
  const at = cut.length === 0 ? url.length : Math.min(...cut);
  const path = url.slice(0, at);
  const suffix = cut.length === 0 ? "" : url.slice(at);
  // Idempotent: an already-marked failure URL is returned unchanged instead of
  // appending a second "/fail" segment.
  if (path.endsWith("/fail")) return url;
  return `${path.replace(/\/$/, "")}/fail${suffix}`;
}

export async function pingCronMonitor(env: Env, healthy: boolean): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  const target = healthy ? url : failTarget(url);
  try {
    const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) logger("warn", `[cron-monitor] ping responded ${res.status} (healthy=${healthy})`);
  } catch (err) {
    logger("warn", `[cron-monitor] ping failed: ${errMsg(err)}`);
  }
}

function isApiRequest(url: URL): boolean {
  return url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
}

function detachHook(ctx?: ExecutionContext): ((work: Promise<unknown>) => void) | undefined {
  return ctx ? (work) => ctx.waitUntil(work) : undefined;
}

export async function fetchHandler(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!isApiRequest(url)) {
    if (!env.ASSETS) return new Response("Static assets binding not configured", { status: 500 });
    const response = await env.ASSETS.fetch(req);
    if (STATIC_FILE_RE.test(url.pathname) && response.headers.get("content-type")?.includes("text/html")) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return response;
  }
  const route = resolveRoute(url.pathname);
  const isHead = req.method === "HEAD";
  if (!route) return isHead ? stripBodyForHead(notFoundResponse()) : notFoundResponse();
  if (req.method === "OPTIONS") {
    const res = new Response(null, { status: 204 });
    res.headers.set("Allow", "GET, HEAD, OPTIONS");
    const { applyApiHeaders } = await import("@/server/http/headers");
    applyApiHeaders(res.headers);
    return res;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowedResponse();
  }
  const res = await handleApi(req, env, url, route, detachHook(ctx));
  return res;
}

export default {
  fetch: fetchHandler,

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      scheduledTask(env)
        .then((result) => pingCronMonitor(env, result.healthy))
        .catch(async (err) => {
          logger("error", `[scheduled] ${errMsg(err)}`);
          await pingCronMonitor(env, false);
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;

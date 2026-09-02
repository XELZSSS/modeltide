import type { Context, Hono } from "hono";
import { startTime, endTime } from "hono/timing";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { RateLimitError } from "@/server/infra/errors";
import { validateQuery } from "@/server/infra/validate";
import { BROWSER_CACHE_HEADER, BROWSER_NO_STORE_HEADER, CDN_CACHE_HEADER, CDN_NO_STORE_HEADER } from "@/shared/config";
import type { RouteDef } from "./types";

function applyCacheHeaders(c: Context, noStore: boolean): void {
  c.header("Cache-Control", noStore ? BROWSER_NO_STORE_HEADER : BROWSER_CACHE_HEADER);
  c.header("CDN-Cache-Control", noStore ? CDN_NO_STORE_HEADER : CDN_CACHE_HEADER);
  c.header("Vary", "Accept, Accept-Encoding");
}

/**
 * Best-effort KV rate limit — skipped when KV is not configured (optional binding)
 * Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — env.CACHE is undefined when kv_namespaces is not configured
 */
async function enforceRateLimit(
  c: Context,
  kv: KVNamespace | undefined,
  rl: { windowSec: number; max: number },
): Promise<void> {
  if (!kv) return;
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  if (!ip) return;
  // Key is path + IP only: including the raw query string lets attackers rotate
  // junk params to mint a fresh budget per request and bypass the limit.
  const key = `rl:${c.req.path}:${ip}`;
  let current: number;
  try {
    current = Number(await kv.get(key));
  } catch {
    return;
  }
  if (Number.isFinite(current) && current >= rl.max) throw new RateLimitError();
  try {
    await kv.put(key, String(Number.isFinite(current) ? current + 1 : 1), { expirationTtl: rl.windowSec });
  } catch {
    return;
  }
}

/** Register every route on the Hono app: validate query params, run the handler, and stamp cache headers. */
export function registerRoutes(app: Hono, routes: readonly RouteDef[]): void {
  for (const route of routes) {
    app.on(["GET", "HEAD"], route.path, async (c) => {
      const context = buildContext(c.env as Env);
      startTime(c, "upstream");
      try {
        if (route.rateLimit) await enforceRateLimit(c, context.kv, route.rateLimit);
        const params = validateQuery(c.req.query(), route.query ?? {});
        const data = await route.handler(context, params);
        // Live-state routes opt out of caching; everything else gets short browser + longer CDN caching.
        applyCacheHeaders(c, route.noStore === true);
        return c.json({ data });
      } finally {
        endTime(c, "upstream");
      }
    });
  }
}

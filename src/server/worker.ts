import { WARM_ORIGIN } from "@/shared/config";
import { createApp } from "@/server/api";
import { buildWarmUrls, routeDefs } from "@/server/routes";
import { recordStatusSamples } from "@/server/sources/status-history";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";

const app = createApp(routeDefs);

// Pre-populate caches and CDN edges for all warm routes on the scheduled trigger.
async function warmUrls(env: Env): Promise<void> {
  const warmUrlsList = buildWarmUrls(WARM_ORIGIN, routeDefs, new Date());
  // Keep concurrency low: each warm request fans out (home=3, AA=4, news=6),
  // and Workers caps subrequests per invocation (~50). 8-way bursts tripped it.
  const CONCURRENCY = 3;
  let failures = 0;
  const failed: string[] = [];
  const queue = [...warmUrlsList];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift() ?? "?";
      try {
        // The internal-origin header lets the API skip per-request logging for
        // cron traffic (pure noise at a 30-minute cadence); never exposed publicly.
        const res = await app.request(url, { headers: { "x-warmup": "1" } }, env);
        if (res.status < 200 || res.status >= 300) {
          failures++;
          failed.push(`${url} (HTTP ${res.status})`);
        }
      } catch (e) {
        console.warn("[worker] warm-up fetch failed:", e);
        failures++;
        failed.push(url);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, warmUrlsList.length) }, () => worker()));
  if (failures > 0) {
    console.warn(`[warm] ${failures}/${warmUrlsList.length} URLs failed: ${failed.join(", ")}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
      const response = await app.fetch(request, env);
      // Non-API 404s fall back to the static-assets fetcher so the Worker can host pages alongside the API.
      if (!isApi && response.status === 404 && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return response;
    } catch (err) {
      console.error("[worker] unhandled fetch error:", err instanceof Error ? err.message : String(err));
      return Response.json({ error: { code: 500, message: "Internal server error" } }, { status: 500 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // One probe round per tick feeds the rolling history store that the
    // status-history route reads; sampling failures must not block the warmup.
    try {
      await recordStatusSamples(buildContext(env));
    } catch (err) {
      console.warn("[status-history] sampling failed:", err instanceof Error ? err.message : String(err));
    }
    try {
      await warmUrls(env);
    } catch (err) {
      console.warn("[warm] warmup failed:", err instanceof Error ? err.message : String(err));
    }
  },
};

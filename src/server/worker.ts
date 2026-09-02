import { WARM_ORIGIN } from "@/shared/config";
import { createApp } from "@/server/api";
import { buildWarmUrls, routeDefs } from "@/server/routes";
import { recordStatusSamples } from "@/server/sources/status-history/store";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";

const app = createApp(routeDefs);

// Pre-populate caches and CDN edges for all warm routes on the scheduled trigger.
async function warmUrls(env: Env): Promise<void> {
  const warmUrlsList = buildWarmUrls(WARM_ORIGIN, routeDefs, new Date());
  const CONCURRENCY = 8;
  let failures = 0;
  const failed: string[] = [];
  const queue = [...warmUrlsList];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift() ?? "?";
      try {
        // The internal-origin header lets the API skip per-request logging for
        // cron traffic (pure noise at 4-minute cadence); never exposed publicly.
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
    const url = new URL(request.url);
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const response = await app.fetch(request, env);
    // Non-API 404s fall back to the static-assets fetcher so the Worker can host pages alongside the API.
    if (!isApi && response.status === 404 && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return response;
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // One probe round per tick feeds BOTH the rolling history and the sources-status
    // route (which reads the store instead of probing again), halving upstream probes.
    // Sampling failures must not block the warmup.
    try {
      await recordStatusSamples(buildContext(env));
    } catch (err) {
      console.warn("[status-history] sampling failed:", err instanceof Error ? err.message : String(err));
    }
    await warmUrls(env);
  },
};

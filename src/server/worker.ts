import { WARM_ORIGIN } from "@/shared/config";
import { createApp } from "@/server/api";
import { bucketWarmUrls, bulkSliceForTick, routeDefs } from "@/server/routes";
import { recordStatusSamples } from "@/server/sources/status-history";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";

const app = createApp(routeDefs);

// Pre-populate caches on the scheduled trigger: live tier every tick,
// bulk tier a rotating slice per tick (free-tier CPU/subrequest safe).
async function warmUrls(env: Env): Promise<void> {
  const now = new Date();
  const { live, bulk } = bucketWarmUrls(WARM_ORIGIN, routeDefs, now);
  const warmUrlsList = [...live, ...bulkSliceForTick(bulk, now)];
  // Serial warmup: each warm request fans out (news ~38, official ~16
  // subrequests), and Workers caps simultaneous outgoing connections at 6
  // with 50 subrequests per tick. Concurrency 3 self-DDoSes into 502s.
  const CONCURRENCY = 1;
  let failures = 0;
  const failed: string[] = [];
  const queue = [...warmUrlsList];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift() ?? "?";
      try {
        // x-warmup marks internal traffic (skipped by request logging).
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
      // Non-API 404s fall back to static assets (same-Worker hosting).
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
    // Probe sampling feeds the status-history store; failures must not block warmup.
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

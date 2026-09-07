import { WARM_ORIGIN } from "@/server/config";
import { createApp } from "@/server/api";
import { buildWarmUrls, warmupHeaders } from "@/server/routes/warmup";
import { routeDefs } from "@/server/routes/table";
import { recordStatusSamples } from "@/server/sources/status/store";
import { buildContext } from "@/server/context";
import { sanitizeLogLine } from "@/server/context";
import type { Env } from "@/server/context";

const app = createApp(routeDefs);

const WARM_URL_TIMEOUT_MS = 15_000;
const WARM_TICK_BUDGET_MS = 60_000;
const SAMPLE_TIMEOUT_MS = 45_000;

async function warmUrls(env: Env): Promise<void> {
  const started = Date.now();
  const warmUrlsList = buildWarmUrls(WARM_ORIGIN, routeDefs);
  let failures = 0;
  const failed: string[] = [];
  for (const url of warmUrlsList) {
    if (Date.now() - started > WARM_TICK_BUDGET_MS) {
      failures++;
      failed.push(`${url} (tick budget exceeded, skipped)`);
      continue;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), WARM_URL_TIMEOUT_MS);
      try {
        const res = await app.request(url, { headers: warmupHeaders(env), signal: ctrl.signal }, env);
        if (res.status < 200 || res.status >= 300) {
          failures++;
          failed.push(`${url} (HTTP ${res.status})`);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      console.warn(sanitizeLogLine(`[worker] warm-up fetch failed: ${e instanceof Error ? e.message : String(e)}`));
      failures++;
      failed.push(url);
    }
  }
  if (failures > 0) {
    console.warn(sanitizeLogLine(`[warm] ${failures}/${warmUrlsList.length} URLs failed: ${failed.join(", ")}`));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
      const response = await app.fetch(request, env);
      if (!isApi && response.status === 404 && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return response;
    } catch (err) {
      console.error(
        sanitizeLogLine(`[worker] unhandled fetch error: ${err instanceof Error ? err.message : String(err)}`),
      );
      return Response.json({ error: { code: 500, message: "Internal server error" } }, { status: 500 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.CACHE) return;
    try {
      await recordStatusSamples(buildContext(env, { signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      console.warn(
        sanitizeLogLine(`[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
    try {
      await warmUrls(env);
    } catch (err) {
      console.warn(sanitizeLogLine(`[warm] warmup failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  },
};

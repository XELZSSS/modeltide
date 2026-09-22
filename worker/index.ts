import { buildContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status";
import { warmTasks, type WarmTier } from "@/server/sources/registry";
import { runCapped } from "@/server/infra/task-pool";
import {
  SAMPLE_TIMEOUT_MS,
  WARM_TASK_TIMEOUT_MS,
  WARM_BATCH_TIMEOUT_MS,
  WARM_CONCURRENCY,
  PING_TIMEOUT_MS,
} from "@/server/config";
import { applyApiHeaders } from "@/shared/config/security";
import { methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "@/server/routes/define-route";
import { handleApi } from "./api-router";

/** Append the Healthchecks `/fail` suffix before any query string or hash. */
function failTarget(url: string): string {
  const cut = [url.indexOf("?"), url.indexOf("#")].filter((i) => i >= 0);
  if (cut.length === 0) return url.endsWith("/") ? `${url}fail` : `${url}/fail`;
  const at = Math.min(...cut);
  return `${url.slice(0, at).replace(/\/$/, "")}/fail${url.slice(at)}`;
}

async function pingCronMonitor(env: Env, healthy: boolean): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  // An invalid URL fails at fetch below and is reported the same way.
  const target = healthy ? url : failTarget(url);
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) console.warn(`[cron-monitor] ping responded ${res.status} (healthy=${healthy})`);
  } catch (err) {
    console.warn(`[cron-monitor] ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Warm tiers per cron fire time. Off-peak minutes (< 30) refresh hourly data
 * too; every 6th hour adds static data. Peak minutes (:30-:59) refresh only
 * core data.
 */
function warmTiersFor(fireMinuteUtc: number, fireHourUtc: number): WarmTier[] {
  if (fireMinuteUtc >= 30) return ["core"];
  return ["core", "hourly", ...(fireHourUtc % 6 === 0 ? (["static"] as const) : [])];
}

interface ScheduledResult {
  sampled: boolean | null;
  warmFailed: number;
  warmTotal: number;
  healthy: boolean;
}

/**
 * Cron health verdict, exported so it is directly testable.
 *
 * `sampled === null` means the round was SKIPPED because another isolate held
 * the sample lock — normal, so it stays healthy. A KV outage no longer arrives
 * here as null (acquireSampleLock rethrows), so it correctly surfaces as false
 * and pings the /fail endpoint instead of leaving the monitor green.
 */
export function cronHealthy(sampled: boolean | null, warmFailed: number, warmTotal: number): boolean {
  const warmOk = warmTotal === 0 || warmFailed < warmTotal;
  return sampled !== false && warmOk;
}

async function scheduledTask(env: Env, fireMinuteUtc: number, fireHourUtc: number): Promise<ScheduledResult> {
  if (!env.CACHE) {
    // Degraded, not failed: status sampling and warmup fall back to memory L1
    // (see buildContext/acquireSampleLock). Don't force healthy:false here —
    // that pinged /fail on every local-dev cron. Health comes from cronHealthy.
    console.warn("[scheduled] CACHE KV not configured: running with memory-only fallback");
  }
  const sampleJob = (async (): Promise<boolean | null> => {
    try {
      return await recordStatusSamples(buildContext(env, { workSignal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      console.warn(`[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  })();
  const warmJob = (async (): Promise<{ failed: number; total: number }> => {
    try {
      const batchSignal = AbortSignal.timeout(WARM_BATCH_TIMEOUT_MS);
      const tasks = warmTiersFor(fireMinuteUtc, fireHourUtc).flatMap((tier) =>
        warmTasks(env, tier, WARM_TASK_TIMEOUT_MS),
      );
      const results = await runCapped(tasks, WARM_CONCURRENCY, { signal: batchSignal });
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[warm] ${failed}/${results.length} warmup calls failed`);
      }
      return { failed, total: results.length };
    } catch (err) {
      console.warn(`[warm] warmup failed: ${err instanceof Error ? err.message : String(err)}`);
      return { failed: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER };
    }
  })();
  const [sampled, warm] = await Promise.all([sampleJob, warmJob]);
  return {
    sampled,
    warmFailed: warm.failed,
    warmTotal: warm.total,
    healthy: cronHealthy(sampled, warm.failed, warm.total),
  };
}

/**
 * Bare `/api` counts too: `run_worker_first` routes it here (wrangler.jsonc),
 * so handing it to ASSETS would answer the SPA shell (HTML, 200) instead of the
 * JSON 404.
 */
function isApiRequest(url: URL): boolean {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

/**
 * A refresh orphaned by a client disconnect must outlive the request that
 * started it, or the cache is never filled and the next caller repeats the same
 * upstream fetch.
 */
function detachHook(ctx?: ExecutionContext): ((work: Promise<unknown>) => void) | undefined {
  return ctx ? (work) => ctx.waitUntil(work) : undefined;
}

async function fetchHandler(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!isApiRequest(url)) {
    if (!env.ASSETS) return new Response("Static assets binding not configured", { status: 500 });
    return env.ASSETS.fetch(req);
  }
  if (req.method === "OPTIONS") {
    const res = new Response(null, { status: 204 });
    applyApiHeaders(res.headers);
    return res;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowedResponse();
  }
  const isHead = req.method === "HEAD";
  const res = (await handleApi(req, env, url, detachHook(ctx))) ?? notFoundResponse();
  return isHead ? stripBodyForHead(res) : res;
}

export default {
  fetch: fetchHandler,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (() => {
        const at = new Date(controller.scheduledTime);
        return scheduledTask(env, at.getUTCMinutes(), at.getUTCHours());
      })()
        .then((result) => pingCronMonitor(env, result.healthy))
        .catch((err) => {
          console.error(`[scheduled] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;

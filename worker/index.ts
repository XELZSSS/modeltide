import { buildContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status";
import { warmTasks, type WarmTier } from "@/server/sources/registry";
import { runCapped, TaskNotRunError } from "@/server/infra/task-pool";
import {
  SAMPLE_TIMEOUT_MS,
  WARM_TASK_TIMEOUT_MS,
  WARM_CONCURRENCY,
  PING_TIMEOUT_MS,
  warmBatchTimeoutMs,
} from "@/server/config";
import { applyApiHeaders } from "@/server/http/headers";
import { API_PREFIX } from "@/shared/config";
import { logger } from "@/server/infra/logger";
import { methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "@/server/routes/define-route";
import { handleApi } from "./api-router";

/** Append the Healthchecks `/fail` suffix before any query string or hash. */
export function failTarget(url: string): string {
  const cut = [url.indexOf("?"), url.indexOf("#")].filter((i) => i >= 0);
  if (cut.length === 0) return url.endsWith("/") ? `${url}fail` : `${url}/fail`;
  const at = Math.min(...cut);
  return `${url.slice(0, at).replace(/\/$/, "")}/fail${url.slice(at)}`;
}

export async function pingCronMonitor(env: Env, healthy: boolean): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  const target = healthy ? url : failTarget(url);
  try {
    const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) logger("warn", `[cron-monitor] ping responded ${res.status} (healthy=${healthy})`);
  } catch (err) {
    logger("warn", `[cron-monitor] ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// `core` must be in EVERY fire: its ceiling is the 30-minute interval between them
// (shared/config/time.ts). `hourly` rides the off-peak fire only, as NEWS_TTL_MS expects; `static` every 6th hour.
export function warmTiersFor(fireMinuteUtc: number, fireHourUtc: number): WarmTier[] {
  if (fireMinuteUtc >= 30) return ["core"];
  return ["core", "hourly", ...(fireHourUtc % 6 === 0 ? (["static"] as const) : [])];
}

interface ScheduledResult {
  sampled: boolean | null;
  warmFailed: number;
  warmTotal: number;
  healthy: boolean;
}

// `sampled === null` is a lock-held skip (healthy); a KV outage rethrows, so it surfaces as false.
// `warmTotal === 0` is a registry regression, not a quiet round, and must not read as healthy.
export function cronHealthy(sampled: boolean | null, warmFailed: number, warmTotal: number): boolean {
  return sampled !== false && warmTotal > 0 && warmFailed === 0;
}

async function scheduledTask(env: Env, fireMinuteUtc: number, fireHourUtc: number): Promise<ScheduledResult> {
  if (!env.CACHE) {
    // Don't force healthy:false here — that pinged /fail on every local-dev cron; health comes from cronHealthy.
    logger("warn", "[scheduled] CACHE KV not configured: running with memory-only fallback");
  }
  // The two legs fan out to several upstreams, so they must not overlap: together they exceed the
  // per-invocation connection budget even when each task has its own timeout.
  const runSampling = async (): Promise<boolean | null> => {
    try {
      return await recordStatusSamples(buildContext(env, { workSignal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      logger("warn", `[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };
  const runWarmup = async (): Promise<{ failed: number; total: number }> => {
    try {
      const tasks = warmTiersFor(fireMinuteUtc, fireHourUtc).flatMap((tier) =>
        warmTasks(env, tier, WARM_TASK_TIMEOUT_MS),
      );
      const batchSignal = AbortSignal.timeout(warmBatchTimeoutMs(tasks.length));
      const results = await runCapped(tasks, WARM_CONCURRENCY, { signal: batchSignal });
      const notRun = results.filter((r) => r.status === "rejected" && r.reason instanceof TaskNotRunError).length;
      const failed = results.filter((r) => r.status === "rejected").length - notRun;
      if (notRun > 0) logger("warn", `[warm] ${notRun}/${results.length} warmup calls never ran before the deadline`);
      if (failed > 0) logger("warn", `[warm] ${failed}/${results.length} warmup calls failed`);
      return { failed, total: results.length - notRun };
    } catch (err) {
      logger("warn", `[warm] warmup failed: ${err instanceof Error ? err.message : String(err)}`);
      return { failed: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER };
    }
  };
  const sampled = await runSampling();
  const warm = await runWarmup();
  return {
    sampled,
    warmFailed: warm.failed,
    warmTotal: warm.total,
    healthy: cronHealthy(sampled, warm.failed, warm.total),
  };
}

// Bare `/api` counts too: run_worker_first routes it here, and ASSETS would answer the SPA shell.
function isApiRequest(url: URL): boolean {
  return url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
}

// A refresh orphaned by a client disconnect must outlive the request that started it (waitUntil).
function detachHook(ctx?: ExecutionContext): ((work: Promise<unknown>) => void) | undefined {
  return ctx ? (work) => ctx.waitUntil(work) : undefined;
}

export async function fetchHandler(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!isApiRequest(url)) {
    if (!env.ASSETS) return new Response("Static assets binding not configured", { status: 500 });
    const response = await env.ASSETS.fetch(req);
    // SPA fallback must never turn a missing hashed JS/CSS file into a cached 200 HTML response.
    if (url.pathname.startsWith("/assets/") && response.headers.get("content-type")?.includes("text/html")) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return response;
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
          logger("error", `[scheduled] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;

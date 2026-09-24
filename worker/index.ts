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
import { handleApi, resolveRoute } from "./api-router";

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

function isPartialPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { partial?: unknown }).partial === true;
}

export function warmRoundOutcome(results: readonly PromiseSettledResult<unknown>[]): {
  notRun: number;
  failed: number;
  degraded: number;
  total: number;
} {
  const notRun = results.filter((r) => r.status === "rejected" && r.reason instanceof TaskNotRunError).length;
  const failed = results.filter((r) => r.status === "rejected").length - notRun;
  const degraded = results.filter((r) => r.status === "fulfilled" && isPartialPayload(r.value)).length;
  return { notRun, failed, degraded, total: results.length };
}

export function cronHealthy(sampled: boolean | null, warmFailed: number, warmTotal: number): boolean {
  return sampled !== false && warmTotal > 0 && warmFailed === 0;
}

async function scheduledTask(env: Env, fireMinuteUtc: number, fireHourUtc: number): Promise<ScheduledResult> {
  if (!env.CACHE) {
    logger("warn", "[scheduled] CACHE KV not configured: running with memory-only fallback");
  }
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
      const { notRun, failed, degraded, total } = warmRoundOutcome(results);
      if (notRun > 0) logger("warn", `[warm] ${notRun}/${total} warmup calls never ran before the deadline`);
      if (failed > 0) logger("warn", `[warm] ${failed}/${total} warmup calls failed`);
      if (degraded > 0) logger("warn", `[warm] ${degraded}/${total} warmup calls cached a partial payload`);
      return { failed: failed + notRun, total };
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

function isApiRequest(url: URL): boolean {
  return url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
}

function detachHook(ctx?: ExecutionContext): ((work: Promise<unknown>) => void) | undefined {
  return ctx ? (work) => ctx.waitUntil(work) : undefined;
}

const STATIC_FILE_RE =
  /\.(?:js|mjs|css|map|json|webmanifest|txt|xml|wasm|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i;
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
    applyApiHeaders(res.headers);
    return res;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowedResponse();
  }
  const res = await handleApi(req, env, url, route, detachHook(ctx));
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
        .catch(async (err) => {
          logger("error", `[scheduled] ${err instanceof Error ? err.message : String(err)}`);
          await pingCronMonitor(env, false);
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;

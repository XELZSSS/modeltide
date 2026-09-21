import { buildContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status";
import { warmTasks } from "@/server/sources/registry";
import { runCapped } from "@/server/infra/pool";
import {
  SAMPLE_TIMEOUT_MS,
  WARM_TASK_TIMEOUT_MS,
  WARM_BATCH_TIMEOUT_MS,
  WARM_CONCURRENCY,
  PING_TIMEOUT_MS,
} from "@/server/config";
import { applyApiHeaders } from "@/shared/config/security";
import { methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "@/server/routes/define-route";
import { handleApi } from "./router";

async function pingCronMonitor(env: Env, healthy: boolean): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  let target = url;
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.endsWith("/")
      ? `${parsed.pathname}${healthy ? "" : "fail"}`
      : `${parsed.pathname}${healthy ? "" : "/fail"}`;
    target = parsed.toString();
  } catch {
    target = healthy ? url : url.endsWith("/") ? `${url}fail` : `${url}/fail`;
  }
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) console.warn(`[cron-monitor] ping responded ${res.status} (healthy=${healthy})`);
  } catch (err) {
    console.warn(`[cron-monitor] ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  if (!env.CACHE) return { sampled: null, warmFailed: 0, warmTotal: 0, healthy: false };
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
      const coreTasks = warmTasks(env, "core", WARM_TASK_TIMEOUT_MS);
      const hourlyTasks = warmTasks(env, "hourly", WARM_TASK_TIMEOUT_MS);
      const tasks =
        fireMinuteUtc < 30
          ? [
              ...coreTasks,
              ...hourlyTasks,
              ...(fireHourUtc % 6 === 0 ? warmTasks(env, "static", WARM_TASK_TIMEOUT_MS) : []),
            ]
          : coreTasks;
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

function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith("/api/");
}

async function fetchHandler(req: Request, env: Env): Promise<Response> {
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
  const res = (await handleApi(req, env, url)) ?? notFoundResponse();
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

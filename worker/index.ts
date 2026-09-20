import { buildContext, type AppContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status";
import { SOURCES, type WarmTier } from "@/server/sources/registry";
import type { QuerySchema, ValidatedQuery } from "@/server/infra/validation";
import { runCapped } from "@/server/infra/pool";
import { applyApiHeaders } from "@/shared/config/security";
import { handleApi } from "./router";

const SAMPLE_TIMEOUT_MS = 45_000;
const WARM_CALL_TIMEOUT_MS = 45_000;
const WARM_CONCURRENCY = 6;
const PING_TIMEOUT_MS = 5_000;

function warmTasks(ctx: AppContext, tier: WarmTier): (() => Promise<unknown>)[] {
  const tasks: (() => Promise<unknown>)[] = [];
  for (const source of SOURCES) {
    if (source.warm !== tier) continue;
    const paramSets = source.warmParams?.length ? source.warmParams : [{} as ValidatedQuery<QuerySchema>];
    for (const params of paramSets) tasks.push(() => source.handler(ctx, params));
  }
  return tasks;
}

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

async function scheduledTask(env: Env, fireMinuteUtc: number, fireHourUtc: number): Promise<ScheduledResult> {
  if (!env.CACHE) return { sampled: null, warmFailed: 0, warmTotal: 0, healthy: false };
  const sampleJob = (async (): Promise<boolean | null> => {
    try {
      return await recordStatusSamples(buildContext(env, { signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      console.warn(`[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  })();
  const warmJob = (async (): Promise<{ failed: number; total: number }> => {
    try {
      const warmSignal = AbortSignal.timeout(WARM_CALL_TIMEOUT_MS);
      const ctx = buildContext(env, { signal: warmSignal });
      const coreTasks = warmTasks(ctx, "core");
      const hourlyTasks = warmTasks(ctx, "hourly");
      const tasks =
        fireMinuteUtc < 30
          ? [...coreTasks, ...hourlyTasks, ...(fireHourUtc % 6 === 0 ? warmTasks(ctx, "static") : [])]
          : coreTasks;
      const results = await runCapped(tasks, WARM_CONCURRENCY, { signal: warmSignal });
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
  const warmOk = warm.total === 0 || warm.failed < warm.total;
  const healthy = sampled !== false && warmOk;
  return { sampled, warmFailed: warm.failed, warmTotal: warm.total, healthy };
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
    const res = Response.json(
      { error: { code: 405, message: "Method not allowed" } },
      { status: 405, headers: { "content-type": "application/json" } },
    );
    applyApiHeaders(res.headers);
    return res;
  }
  const isHead = req.method === "HEAD";
  const res = await handleApi(req, env, url);
  if (res) {
    if (!isHead) return res;
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(null, { status: res.status, headers });
  }
  const notFound = Response.json(
    { error: { code: 404, message: "Not found" } },
    { status: 404, headers: { "content-type": "application/json" } },
  );
  applyApiHeaders(notFound.headers);
  if (!isHead) return notFound;
  const headers = new Headers(notFound.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(null, { status: notFound.status, headers });
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

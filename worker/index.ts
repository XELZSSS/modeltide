import { buildContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status/store";
import { getHomeDashboard } from "@/server/sources/home";
import { getIntelligenceIndex } from "@/server/sources/aa/intelligence-index";
import { getNews } from "@/server/sources/news";
import { getAgentRankings } from "@/server/sources/agent-arena";
import { getClosedReleases } from "@/server/sources/closed-releases";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getOfficialPricing } from "@/server/sources/pricing";
import { NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { runCapped } from "@/server/infra/pool";
import { applyApiHeaders } from "@/shared/config/security";
import { handleApi } from "./router";

const SAMPLE_TIMEOUT_MS = 25_000;
// Batch-level backstop only; individual fetches carry their own timeouts
// (10s default, 15s litellm, one retry each). Must fit two sequential
// concurrency waves in the pathological all-slow case: ~30s (litellm retry
// chain) + ~15s for the stragglers of the second wave.
const WARM_CALL_TIMEOUT_MS = 45_000;
const WARM_CONCURRENCY = 6;
const PING_TIMEOUT_MS = 5_000;
// Mirrors normalizeModelLimit buckets (shared/config/limits): one warmed KV
// key per limit so the client's limit switcher never cold-starts on HF.
const OPEN_SOURCE_MODEL_LIMIT_BUCKETS = [50, 100, 200, 500];

// Dead-man's switch: Healthchecks.io (or compatible) alerts when pings stop
// arriving. Covers the blind spot of never firing at all (config lost,
// account issue) rather than firing and failing.
// On top of that, a firing-but-failing cron pings the /fail endpoint so a
// fully-broken sampling/warmup round pages immediately instead of looking
// healthy. Convention: success URL + "/fail" (Healthchecks-compatible).
async function pingCronMonitor(env: Env, healthy: boolean): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  const target = healthy ? url : url.endsWith("/") ? `${url}fail` : `${url}/fail`;
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
  if (!env.CACHE) return { sampled: null, warmFailed: 0, warmTotal: 0, healthy: true };
  const sampleJob = (async (): Promise<boolean | null> => {
    try {
      return await recordStatusSamples(buildContext(env, { signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      console.warn(`[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  })();
  // Warmup: directly invoke data sources (no HTTP self-fetch).
  // Split by KV write pressure (free-plan bottleneck: 1000 writes/day):
  // - every pass warms the short-TTL core (30-min data);
  // - the first pass of each hour additionally warms the 2h lists;
  // - the 6h static archives (official pricing, closed releases) warm on the
  //   first pass every 6h only — rewriting a 6h-TTL key hourly wastes 4x writes.
  // status-history is noStore and intentionally skipped. Sampling and warmup
  // run concurrently; warmup is concurrency-capped so one slow upstream
  // doesn't abort the batch.
  const warmJob = (async (): Promise<{ failed: number; total: number }> => {
    try {
      const warmSignal = AbortSignal.timeout(WARM_CALL_TIMEOUT_MS);
      const ctx = buildContext(env, { signal: warmSignal });
      // Short-TTL core (30-min cadence): home SSR inputs + news + rankings
      // data the home and rankings pages read on every visit.
      const coreTasks: (() => Promise<unknown>)[] = [
        () => getIntelligenceIndex(ctx),
        () => getHomeDashboard(ctx),
        ...NEWS_CATEGORIES.map((category) => () => getNews(ctx, category)),
      ];
      // 2h lists, warmed once an hour. Open-source models warm every limit
      // bucket of the client's default sort/direction (normalizeModelLimit
      // buckets: 50/100/200/500) so limit switches hit KV instead of HF.
      // Non-default sorts stay cold by design (5 sorts x 2 dirs = 40 keys).
      const hourlyTasks: (() => Promise<unknown>)[] = [
        () => getAgentRankings(ctx),
        () => getReleases(ctx),
        ...OPEN_SOURCE_MODEL_LIMIT_BUCKETS.map(
          (limit) => () => getModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS, limit }),
        ),
      ];
      // 6h static archives: warmed on the first pass every 6 hours.
      const staticTasks: (() => Promise<unknown>)[] = [() => getOfficialPricing(ctx), () => getClosedReleases(ctx)];
      const tasks =
        fireMinuteUtc < 30 ? [...coreTasks, ...hourlyTasks, ...(fireHourUtc % 6 === 0 ? staticTasks : [])] : coreTasks;
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
  // Healthy = sampling wrote (or was skipped due to lock contention) AND warmup
  // didn't totally fail. Partial warmup failures are normal upstream flakiness
  // and stay green; total failure or an empty sampling round pages via /fail.
  const warmOk = warm.total === 0 || warm.failed < warm.total;
  const healthy = sampled !== false && warmOk;
  return { sampled, warmFailed: warm.failed, warmTotal: warm.total, healthy };
}

function isApiRequest(url: URL): boolean {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

// The Worker only ever sees /api/* (run_worker_first in wrangler.jsonc) plus
// the rare non-navigation asset miss (e.g. curl without Sec-Fetch-Mode), which
// falls through to the asset layer's SPA handling.
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
  if (res) return isHead ? new Response(null, { status: res.status, headers: res.headers }) : res;
  const notFound = Response.json(
    { error: { code: 404, message: "Not found" } },
    { status: 404, headers: { "content-type": "application/json" } },
  );
  applyApiHeaders(notFound.headers);
  return isHead ? new Response(null, { status: notFound.status, headers: notFound.headers }) : notFound;
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

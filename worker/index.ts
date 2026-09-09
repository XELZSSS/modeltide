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

// Dead-man's switch: Healthchecks.io (or compatible) alerts when pings stop
// arriving. Covers the blind spot of never firing at all (config lost,
// account issue) rather than firing and failing.
async function pingCronMonitor(env: Env): Promise<void> {
  const url = env.STATUS_PING_URL;
  if (!url) return;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) console.warn(`[cron-monitor] ping responded ${res.status}`);
  } catch (err) {
    console.warn(`[cron-monitor] ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function scheduledTask(env: Env, fireMinuteUtc: number): Promise<void> {
  if (!env.CACHE) return;
  const sampleJob = (async (): Promise<void> => {
    try {
      await recordStatusSamples(buildContext(env, { signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      console.warn(`[status-history] sampling failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
  // Warmup: directly invoke data sources (no HTTP self-fetch).
  // Split by KV write pressure: the first cron pass of each hour warms
  // everything; the second pass warms only the short-TTL keys (30-min data)
  // and skips the long-TTL lists (2h/6h), halving their write frequency —
  // KV writes are the free-plan bottleneck (1000/day) and a 2h-TTL key gains
  // nothing from being rewritten every 30 minutes. status-history is noStore
  // and intentionally skipped. Sampling and warmup run concurrently; warmup
  // is concurrency-capped so one slow upstream doesn't abort the batch.
  const warmJob = (async (): Promise<void> => {
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
      // Long-TTL lists (2h/6h): warmed once an hour. Parameters must mirror
      // the client's default queries (queryKeys.openSourceModels) or the
      // warmed KV key is never read.
      const slowTasks: (() => Promise<unknown>)[] = [
        () => getAgentRankings(ctx),
        () => getOfficialPricing(ctx),
        () => getClosedReleases(ctx),
        () => getReleases(ctx),
        () => getModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }),
      ];
      const tasks = fireMinuteUtc < 30 ? [...coreTasks, ...slowTasks] : coreTasks;
      const results = await runCapped(tasks, WARM_CONCURRENCY, { signal: warmSignal });
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[warm] ${failed}/${results.length} warmup calls failed`);
      }
    } catch (err) {
      console.warn(`[warm] warmup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
  await Promise.allSettled([sampleJob, warmJob]);
}

function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith("/api");
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
  if (req.method !== "GET") {
    const res = Response.json(
      { error: { code: 405, message: "Method not allowed" } },
      { status: 405, headers: { "content-type": "application/json" } },
    );
    applyApiHeaders(res.headers);
    return res;
  }
  const res = await handleApi(req, env, url);
  if (res) return res;
  const notFound = Response.json(
    { error: { code: 404, message: "Not found" } },
    { status: 404, headers: { "content-type": "application/json" } },
  );
  applyApiHeaders(notFound.headers);
  return notFound;
}

export default {
  fetch: fetchHandler,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      scheduledTask(env, new Date(controller.scheduledTime).getUTCMinutes())
        .then(() => pingCronMonitor(env))
        .catch((err) => {
          console.error(`[scheduled] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;

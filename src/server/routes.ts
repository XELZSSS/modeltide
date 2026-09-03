import type { Context, Hono } from "hono";
import { startTime, endTime } from "hono/timing";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { RateLimitError, validateQuery, qEnum, qNum, type QuerySchema, type ValidatedQuery } from "@/server/infra";
import type { AppContext } from "@/server/context";
import {
  ARENA_BOARD_IDS,
  BROWSER_CACHE_HEADER,
  BROWSER_NO_STORE_HEADER,
  CDN_CACHE_HEADER,
  CDN_NO_STORE_HEADER,
  apiPaths,
  NEWS_CATEGORIES,
  OPEN_SOURCE_MODELS_DEFAULTS,
  newsWarmDue,
} from "@/shared/config";
import { getIntelligenceIndex } from "@/server/sources/artificial-analysis";
import { getArenaBoard, getArenaRankings } from "@/server/sources/arena";
import { getOfficialPricing } from "@/server/sources/official-pricing";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getHomeDashboard } from "@/server/sources/home";
import { getNews } from "@/server/sources/news";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getClosedReleases } from "@/server/sources/closed-releases";
import { getStatusHistory } from "@/server/sources/status-history";

/** Declarative route descriptor: path, optional query schema (validated per request), cache policy, and the handler. */
export interface RouteDef<S extends QuerySchema = QuerySchema> {
  path: string;
  query?: S;
  /**
   * Cron warmup mode: "all" warms every enum-param combination on each tick;
   * "window" (long-TTL routes like news) warms only inside the TTL-aligned window.
   */
  warm?: "all" | "window";
  /** Skip browser/CDN caching for responses that must reflect live state (e.g. probe results). */
  noStore?: boolean;
  /**
   * Best-effort per-IP KV rate limit, applied only to clients presenting a
   * CF-Connecting-IP (Cloudflare always sets one in production). Keyed per path,
   * so two fields on different routes get independent budgets.
   */
  rateLimit?: { windowSec: number; max: number };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

/**
 * Give a single route definition its precise type: the query schema is inferred
 * from the literal so handler params are fully typed without casts.
 */
export function defineRoute<S extends QuerySchema>(def: RouteDef<S>): RouteDef<S> {
  return def;
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1", "1"] as const;

// Route table: paths come from the shared `apiPaths` map; every entry is registered
// on the app and (when warm) hit by the scheduled trigger.
export const routeDefs = [
  defineRoute({
    path: apiPaths.artificialIndex,
    // Heaviest handler (index + parallel enrichment + OpenRouter meta); cap scraping.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getIntelligenceIndex(ctx),
  }),
  defineRoute({
    path: apiPaths.openSourceModels,
    query: {
      // Schema defaults derive from the same shared constant the client uses,
      // so a request without params and the client's default query agree.
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      direction: qEnum(SORT_DIRECTIONS, OPEN_SOURCE_MODELS_DEFAULTS.direction),
      limit: qNum({
        default: String(OPEN_SOURCE_MODELS_DEFAULTS.limit),
        min: 1,
        max: OPEN_SOURCE_MODELS_DEFAULTS.limit,
        integer: true,
      }),
    },
    // Large JSON payload (500 full HF records); generous budget blocks
    // limit-traversal scraping while leaving normal UI polling untouched.
    rateLimit: { windowSec: 60, max: 120 },
    // validateQuery has already applied schema defaults and converted numbers; no fallbacks needed here.
    handler: (ctx, params) => getModels(ctx, params),
  }),
  defineRoute({
    path: apiPaths.openSourceReleases,
    // Full HF scan; cap scraping like the models table.
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.news,
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    warm: "window",
    // 1 request fans out to 6 RSS fetches; budget stops scripted amplification.
    rateLimit: { windowSec: 60, max: 60 },
    // News feeds have a long TTL; only refresh them within the TTL-aligned warm window.
    handler: (ctx, params) => getNews(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.openRouterRankings,
    // Fans out to rankings + pricing directory; cap scraping.
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.closedReleases,
    // Single changelog page fetch (+ cached index cross-check, no extra upstream fetch); cap scraping.
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getClosedReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.arenaBoard,
    query: { category: qEnum(ARENA_BOARD_IDS, ARENA_BOARD_IDS[0]) },
    warm: "all",
    // One ~3MB page fetch + regex parse per category; budget stops scripted amplification.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getArenaBoard(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.arenaRankings,
    // Single ~3MB page fetch + regex parse; cap scraping.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getArenaRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.officialPricing,
    // Fans out to 6 provider doc pages (8 fetches with Kimi's 3 sub-pages);
    // per-provider failures only shorten the TTL, so cap scraping loosely.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getOfficialPricing(ctx),
  }),
  defineRoute({
    path: apiPaths.homeDashboard,
    // 1 request fans out to 3 sub-sources; budget stops scripted amplification.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getHomeDashboard(ctx),
  }),
  defineRoute({
    path: apiPaths.statusHistory,
    // The route self-heals stale samples on read, so CDN caching would defeat it;
    // only the low-traffic status pages hit the origin directly.
    noStore: true,
    // A stale read can trigger a live 7-target probe round; rate-limit it.
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

function applyCacheHeaders(c: Context, noStore: boolean): void {
  c.header("Cache-Control", noStore ? BROWSER_NO_STORE_HEADER : BROWSER_CACHE_HEADER);
  c.header("CDN-Cache-Control", noStore ? CDN_NO_STORE_HEADER : CDN_CACHE_HEADER);
  c.header("Vary", "Accept, Accept-Encoding");
}

/**
 * Best-effort KV rate limit — skipped when KV is not configured (optional binding)
 * Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — env.CACHE is undefined when kv_namespaces is not configured
 */
async function enforceRateLimit(
  c: Context,
  kv: KVNamespace | undefined,
  rl: { windowSec: number; max: number },
): Promise<void> {
  if (!kv) return;
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  if (!ip) return;
  // Key is path + IP only: including the raw query string lets attackers rotate
  // junk params to mint a fresh budget per request and bypass the limit.
  const key = `rl:${c.req.path}:${ip}`;
  let current: number;
  try {
    current = Number(await kv.get(key));
  } catch {
    return;
  }
  if (Number.isFinite(current) && current >= rl.max) throw new RateLimitError();
  try {
    await kv.put(key, String(Number.isFinite(current) ? current + 1 : 1), { expirationTtl: rl.windowSec });
  } catch {
    return;
  }
}

/** Register every route on the Hono app: validate query params, run the handler, and stamp cache headers. */
export function registerRoutes(app: Hono, routes: readonly RouteDef[]): void {
  for (const route of routes) {
    app.on(["GET", "HEAD"], route.path, async (c) => {
      const context = buildContext(c.env as Env);
      startTime(c, "upstream");
      try {
        if (route.rateLimit) await enforceRateLimit(c, context.kv, route.rateLimit);
        const params = validateQuery(c.req.query(), route.query ?? {});
        const data = await route.handler(context, params);
        // Live-state routes opt out of caching; everything else gets short browser + longer CDN caching.
        applyCacheHeaders(c, route.noStore === true);
        return c.json({ data });
      } finally {
        endTime(c, "upstream");
      }
    });
  }
}

function withQuery(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Expand each route into concrete warmup URLs: enum-valued params are enumerated
 * for warm routes, remaining params fall back to their schema defaults.
 * "window" routes are only due within their TTL-aligned warming window, so the
 * frequent cron skips them otherwise instead of rewriting fresh cache entries.
 */
export function buildWarmUrls(base: string, routes: readonly RouteDef[], now: Date = new Date()): string[] {
  const includeWarmWindow = newsWarmDue(now.getUTCMinutes());
  return (
    routes
      // noStore routes (live probe results, self-healing history) gain nothing
      // from CDN warming — and warming status-history would trigger a duplicate
      // 7-target probe round on top of the scheduled sampler. Skip them.
      .filter((route) => route.noStore !== true)
      .filter((route) => route.warm !== "window" || includeWarmWindow)
      .flatMap((route) => {
        const specs = route.query ?? {};
        const defaults: Record<string, string> = {};
        for (const [name, spec] of Object.entries(specs)) {
          if (spec.default !== undefined) defaults[name] = spec.default;
        }
        if (!route.warm) return [withQuery(base + route.path, defaults)];

        let combos: Record<string, string>[] = [{}];
        for (const [name, spec] of Object.entries(specs)) {
          if (spec.type !== "enum") continue;
          combos = combos.flatMap((combo) => spec.values.map((v) => ({ ...combo, [name]: v })));
        }
        return combos.map((combo) => withQuery(base + route.path, { ...defaults, ...combo }));
      })
  );
}

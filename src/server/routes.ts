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
  THIRTY_MINUTES,
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

/** Route descriptor: path, query schema, cache policy, handler. */
export interface RouteDef<S extends QuerySchema = QuerySchema> {
  path: string;
  query?: S;
  /**
   * Cron warmup mode: "all" warms every enum-param combination on each tick;
   * "window" (long-TTL routes like news) warms only inside the TTL-aligned window.
   */
  warm?: "all" | "window";
  /**
   * Warmup priority for the free-tier rotation (see bucketWarmUrls):
   * - "live" (30m-TTL routes) warms every tick so user-facing data stays fresh;
   * - "bulk" (slow/static routes) warms a few per tick on rotation, bounding
   *   per-tick CPU and subrequests within the free plan (10ms CPU, 50 subrequests).
   * Defaults to "bulk" so a newly added route can never silently blow the
   * per-tick budget — tag genuinely hot routes "live" explicitly.
   */
  warmPriority?: "live" | "bulk";
  /** Skip browser/CDN caching for live-state responses. */
  noStore?: boolean;
  /** Best-effort per-IP KV rate limit, keyed per path. */
  rateLimit?: { windowSec: number; max: number };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

/** Infers the query schema from the literal so handler params are fully typed. */
export function defineRoute<S extends QuerySchema>(def: RouteDef<S>): RouteDef<S> {
  return def;
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1", "1"] as const;

// Route table: paths come from the shared `apiPaths` map.
export const routeDefs = [
  defineRoute({
    path: apiPaths.artificialIndex,
    warmPriority: "live",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getIntelligenceIndex(ctx),
  }),
  defineRoute({
    path: apiPaths.openSourceModels,
    warmPriority: "bulk",
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      direction: qEnum(SORT_DIRECTIONS, OPEN_SOURCE_MODELS_DEFAULTS.direction),
      limit: qNum({
        default: String(OPEN_SOURCE_MODELS_DEFAULTS.limit),
        min: 1,
        max: OPEN_SOURCE_MODELS_DEFAULTS.limit,
        integer: true,
      }),
    },
    // Large payload (500 full HF records); cap limit-traversal scraping.
    rateLimit: { windowSec: 60, max: 120 },
    // validateQuery already applied schema defaults; no fallbacks needed here.
    handler: (ctx, params) => getModels(ctx, params),
  }),
  defineRoute({
    path: apiPaths.openSourceReleases,
    warmPriority: "bulk",
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.news,
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    warm: "window",
    warmPriority: "live",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getNews(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.openRouterRankings,
    warmPriority: "live",
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.closedReleases,
    warmPriority: "bulk",
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getClosedReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.arenaBoard,
    query: { category: qEnum(ARENA_BOARD_IDS, ARENA_BOARD_IDS[0]) },
    warm: "all",
    warmPriority: "bulk",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getArenaBoard(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.arenaRankings,
    warmPriority: "bulk",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getArenaRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.officialPricing,
    warmPriority: "bulk",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getOfficialPricing(ctx),
  }),
  defineRoute({
    path: apiPaths.homeDashboard,
    warmPriority: "live",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getHomeDashboard(ctx),
  }),
  defineRoute({
    path: apiPaths.statusHistory,
    // Reads self-heal stale samples, so CDN caching would defeat it.
    noStore: true,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

function applyCacheHeaders(c: Context, noStore: boolean): void {
  c.header("Cache-Control", noStore ? BROWSER_NO_STORE_HEADER : BROWSER_CACHE_HEADER);
  c.header("CDN-Cache-Control", noStore ? CDN_NO_STORE_HEADER : CDN_CACHE_HEADER);
  // JSON API responses don't vary by Accept; keep encoding-only to avoid
  // needless cache fragmentation.
  c.header("Vary", "Accept-Encoding");
}

/**
 * Best-effort KV rate limit — skipped when KV is not configured.
 * Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/
 */
async function enforceRateLimit(
  c: Context,
  kv: KVNamespace | undefined,
  rl: { windowSec: number; max: number },
): Promise<void> {
  if (!kv) return;
  // Prefer the CF edge header (unspoofable); fall back to the first XFF
  // entry only when CF is absent (e.g. local dev). Sanitize to bound KV key
  // length (512B limit) and avoid budget minting via overlong values.
  const cfIp = c.req.header("CF-Connecting-IP")?.trim();
  const xffFirst = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  const rawIp = cfIp || xffFirst;
  if (!rawIp) return;
  // Basic IP/host sanity: truncate and reject control chars / overlong values.
  if (/[\s\r\n]/.test(rawIp) || rawIp.length > 45) return;
  const ip = rawIp.slice(0, 45);
  // Path + IP only: including the query string lets attackers mint fresh budgets.
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

/** Register every route: validate query, run handler, stamp cache headers. */
export function registerRoutes(app: Hono, routes: readonly RouteDef[]): void {
  for (const route of routes) {
    app.on(["GET", "HEAD"], route.path, async (c) => {
      const context = buildContext(c.env as Env);
      startTime(c, "upstream");
      try {
        if (route.rateLimit) await enforceRateLimit(c, context.kv, route.rateLimit);
        const params = validateQuery(c.req.query(), route.query ?? {});
        const data = await route.handler(context, params);
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
 * Expand each route into warmup URLs: enum params are enumerated for warm
 * routes, the rest use schema defaults. "window" routes are due only inside
 * their TTL-aligned window.
 */
export function buildWarmUrls(base: string, routes: readonly RouteDef[], now: Date = new Date()): string[] {
  const includeWarmWindow = newsWarmDue(now.getUTCMinutes());
  return (
    routes
      // noStore routes gain nothing from warming; skip them.
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
          // Bound cartesian explosion: future multi-enum routes must not
          // silently blow the per-tick subrequest budget.
          if (combos.length > 20) {
            combos = combos.slice(0, 20);
            break;
          }
        }
        return combos.map((combo) => withQuery(base + route.path, { ...defaults, ...combo }));
      })
  );
}

export interface WarmBuckets {
  /** 30m-tier URLs warmed on every tick. */
  live: string[];
  /** Slow/static URLs warmed a few per tick on rotation (see worker.ts). */
  bulk: string[];
}

/**
 * Split the warmup set into live (every tick) and bulk (rotated) buckets.
 * Same expansion semantics as buildWarmUrls — only the grouping differs.
 */
export function bucketWarmUrls(base: string, routes: readonly RouteDef[], now: Date = new Date()): WarmBuckets {
  const isLive = (route: RouteDef): boolean => route.warmPriority === "live";
  return {
    live: buildWarmUrls(
      base,
      routes.filter((route) => isLive(route)),
      now,
    ),
    bulk: buildWarmUrls(
      base,
      routes.filter((route) => !isLive(route)),
      now,
    ),
  };
}

export const BULK_PER_TICK = 4;

/**
 * Time-slice rotation over the bulk bucket: no KV cursor (saves free-tier
 * writes), every isolate agrees on the slice.
 */
export function bulkSliceForTick(bulk: string[], now: Date = new Date()): string[] {
  if (bulk.length === 0) return [];
  const time = now.getTime();
  if (!Number.isFinite(time)) return bulk.slice(0, BULK_PER_TICK);
  const tick = Math.floor(time / THIRTY_MINUTES);
  const chunks = Math.max(1, Math.ceil(bulk.length / BULK_PER_TICK));
  const start = (tick % chunks) * BULK_PER_TICK;
  return bulk.slice(start, start + BULK_PER_TICK);
}

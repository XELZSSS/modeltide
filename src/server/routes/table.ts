import type { Context, Hono } from "hono";
import { startTime, endTime } from "hono/timing";
import { buildContext } from "@/server/context";
import type { Env } from "@/server/context";
import { validateQuery, type QuerySchema, type ValidatedQuery } from "@/server/infra/validation";
import { qEnum, qNum } from "@/server/infra/validation";
import type { AppContext } from "@/server/context";
import {
  ARENA_BOARD_IDS,
  MAX_MODEL_LIMIT,
  apiPaths,
  NEWS_CATEGORIES,
  OPEN_SOURCE_MODELS_DEFAULTS,
} from "@/shared/config";
import { BROWSER_CACHE_HEADER, BROWSER_NO_STORE_HEADER, CDN_CACHE_HEADER, CDN_NO_STORE_HEADER } from "@/server/config";
import { getIntelligenceIndex } from "@/server/sources/aa/intelligence-index";
import { getArenaBoard, getArenaRankings } from "@/server/sources/arena";
import { getOfficialPricing } from "@/server/sources/pricing";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getHomeDashboard } from "@/server/sources/home";
import { getNews } from "@/server/sources/news";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getClosedReleases } from "@/server/sources/closed-releases";
import { getStatusHistory } from "@/server/sources/status-history";
import { enforceRateLimit } from "@/server/routes/rate-limit";
import { isWarmupRequest } from "@/server/routes/warmup";

export interface RouteDef<S extends QuerySchema = QuerySchema> {
  path: string;
  query?: S;
  warm?: "all";
  noStore?: boolean;
  rateLimit?: { windowSec: number; max: number };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

export function defineRoute<S extends QuerySchema>(def: RouteDef<S>): RouteDef<S> {
  return def;
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1", "1"] as const;

export const routeDefs = [
  defineRoute({
    path: apiPaths.artificialIndex,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getIntelligenceIndex(ctx),
  }),
  defineRoute({
    path: apiPaths.openSourceModels,
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      direction: qEnum(SORT_DIRECTIONS, OPEN_SOURCE_MODELS_DEFAULTS.direction),
      limit: qNum({
        default: String(OPEN_SOURCE_MODELS_DEFAULTS.limit),
        min: 1,
        max: MAX_MODEL_LIMIT,
        integer: true,
      }),
    },
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getModels(ctx, params),
  }),
  defineRoute({
    path: apiPaths.openSourceReleases,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.news,
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    warm: "all",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getNews(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.openRouterRankings,
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.closedReleases,
    rateLimit: { windowSec: 60, max: 120 },
    handler: (ctx) => getClosedReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.arenaBoard,
    query: { category: qEnum(ARENA_BOARD_IDS, ARENA_BOARD_IDS[0]) },
    warm: "all",
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx, params) => getArenaBoard(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.arenaRankings,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getArenaRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.officialPricing,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getOfficialPricing(ctx),
  }),
  defineRoute({
    path: apiPaths.homeDashboard,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getHomeDashboard(ctx),
  }),
  defineRoute({
    path: apiPaths.statusHistory,
    noStore: true,
    rateLimit: { windowSec: 60, max: 60 },
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

function applyCacheHeaders(c: Context, noStore: boolean): void {
  c.header("Cache-Control", noStore ? BROWSER_NO_STORE_HEADER : BROWSER_CACHE_HEADER);
  c.header("CDN-Cache-Control", noStore ? CDN_NO_STORE_HEADER : CDN_CACHE_HEADER);
  c.header("Vary", "Accept-Encoding");
}

export function registerRoutes(app: Hono, routes: readonly RouteDef[]): void {
  for (const route of routes) {
    app.on(["GET", "HEAD"], route.path, async (c) => {
      const context = buildContext(c.env as Env, { signal: c.req.raw.signal });
      startTime(c, "upstream");
      try {
        if (route.rateLimit && !isWarmupRequest(c)) enforceRateLimit(c, route.rateLimit);
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

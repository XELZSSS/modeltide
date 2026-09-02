import { getIntelligenceIndex } from "@/server/sources/artificial-analysis";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getHomeDashboard } from "@/server/sources/home";
import { getNews } from "@/server/sources/news";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getSourcesStatusFull } from "@/server/sources/status";
import { getStatusHistory } from "@/server/sources/status-history/store";
import { apiPaths, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { qEnum, qNum } from "@/server/infra/validate";
import { defineRoute } from "./types";

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1", "1"] as const;
const REFRESH_FLAGS = ["1", "0"] as const;

// Route table: paths come from the shared `apiPaths` map; every entry is registered
// on the app and (when warm) hit by the scheduled trigger.
export const routeDefs = [
  defineRoute({
    path: apiPaths.artificialIndex,
    handler: (ctx) => getIntelligenceIndex(ctx),
  }),
  defineRoute({
    path: apiPaths.openSourceModels,
    query: {
      // Schema defaults derive from the same shared constant the client uses,
      // so a request without params and the client's default query agree.
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      direction: qEnum(SORT_DIRECTIONS, OPEN_SOURCE_MODELS_DEFAULTS.direction),
      limit: qNum({ default: "500", min: 1, max: OPEN_SOURCE_MODELS_DEFAULTS.limit }),
    },
    // validateQuery has already applied schema defaults and converted numbers; no fallbacks needed here.
    handler: (ctx, params) => getModels(ctx, params),
  }),
  defineRoute({
    path: apiPaths.openSourceReleases,
    handler: (ctx) => getReleases(ctx),
  }),
  defineRoute({
    path: apiPaths.news,
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    warm: "window",
    // News feeds have a long TTL; only refresh them within the TTL-aligned warm window.
    handler: (ctx, params) => getNews(ctx, params.category),
  }),
  defineRoute({
    path: apiPaths.openRouterRankings,
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  defineRoute({
    path: apiPaths.sourcesStatus,
    query: { refresh: qEnum(REFRESH_FLAGS, "0") },
    // Live probe results must not be cached by browsers or the CDN.
    noStore: true,
    // `refresh=1` triggers a live probe round against every upstream; the generous
    // budget covers the UI's manual refresh while blocking scripted amplification.
    rateLimit: { windowSec: 300, max: 6 },
    handler: (ctx, params) => getSourcesStatusFull(ctx, params.refresh === "1"),
  }),
  defineRoute({
    path: apiPaths.homeDashboard,
    handler: (ctx) => getHomeDashboard(ctx),
  }),
  defineRoute({
    path: apiPaths.statusHistory,
    // The route self-heals stale samples on read, so CDN caching would defeat it;
    // only the low-traffic status pages hit the origin directly.
    noStore: true,
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

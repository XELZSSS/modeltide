import { getIntelligenceIndex } from "@/server/sources/artificial-analysis";
import { getModels, getReleases } from "@/server/sources/huggingface";
import { getHomeDashboard } from "@/server/sources/home";
import { getNews } from "@/server/sources/news";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getStatusHistory } from "@/server/sources/status-history/store";
import { apiPaths, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { qEnum, qNum } from "@/server/infra/validate";
import { defineRoute } from "./types";

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

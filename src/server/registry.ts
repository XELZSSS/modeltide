import type { ApiRouteDef } from "./api/router";
import { qEnum, qStr, type QuerySchema } from "./api/validation";
import { SHORT_CACHE_HEADERS } from "./api/headers";
import type { ApiDomain } from "@/shared/contract";
import { apiPaths, MAX_NAME_CHARS, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { OPEN_SOURCE_SORTS, SORT_DIRECTIONS } from "@/shared/query-schemas";
import { getIntelligenceIndex } from "./aa";

import { getClosedReleases } from "./releases/source";
import { getHomeDashboard } from "./home/source";
import { getNews } from "./news/source";
import { getModelById, getModels } from "./huggingface/source";
import { getOpenRouterRankings } from "./openrouter/rankings";

interface SourceEntry<D extends ApiDomain = ApiDomain, Q extends QuerySchema = QuerySchema> extends ApiRouteDef<D, Q> {
  readonly domain: D;
  readonly path: string;
}

function defineSource<D extends ApiDomain, Q extends QuerySchema = QuerySchema>(
  domain: D,
  def: ApiRouteDef<D, Q>,
): SourceEntry<D, Q> {
  return { domain, path: apiPaths[domain], ...def };
}

const ENTRIES = {
  artificialIndex: defineSource("artificialIndex", {
    handler: (ctx) => getIntelligenceIndex(ctx),
  }),
  homeDashboard: defineSource("homeDashboard", {
    handler: (ctx) => getHomeDashboard(ctx),
  }),
  news: defineSource("news", {
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    handler: (ctx, params) => getNews(ctx, params.category),
  }),

  openSourceModels: defineSource("openSourceModels", {
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      direction: qEnum(SORT_DIRECTIONS, OPEN_SOURCE_MODELS_DEFAULTS.direction),
    },
    handler: (ctx, params) => getModels(ctx, params),
  }),
  closedReleases: defineSource("closedReleases", {
    handler: (ctx) => getClosedReleases(ctx),
  }),
  openSourceModel: defineSource("openSourceModel", {
    query: { id: qStr({ maxLength: MAX_NAME_CHARS }) },
    cache: SHORT_CACHE_HEADERS,
    handler: (ctx, params) => getModelById(ctx, params.id),
  }),
  openRouterRankings: defineSource("openRouterRankings", {
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

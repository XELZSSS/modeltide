import type { ApiRouteDef } from "./api/router";
import { type CacheDurations, cacheDurationsForTtl, SHORTEST_CACHE_DURATIONS } from "./api/headers";
import { qEnum, qStr, type QuerySchema } from "./api/validation";
import type { ApiDomain } from "@/shared/contract";
import { apiPaths, MAX_MODEL_ID_CHARS, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { OPEN_SOURCE_SORTS } from "@/shared/query-schemas";
import { ARTIFICIAL_INDEX_TTL_MS, getIntelligenceIndex } from "./aa";
import { CLOSED_RELEASES_TTL_MS, getClosedReleases } from "./releases/source";
import { getHomeDashboard, HOME_DASHBOARD_TTL_MS } from "./home/source";
import { getNews, NEWS_CATEGORY_TTL_MS } from "./news/source";
import { getOpenSourceModels, OPEN_SOURCE_MODELS_TTL_MS } from "./huggingface/source";
import { getOpenRouterRankings, OPENROUTER_RANKINGS_TTL_MS } from "./openrouter/rankings";

interface SourceEntry<D extends ApiDomain = ApiDomain, Q extends QuerySchema = QuerySchema> extends ApiRouteDef<D, Q> {
  readonly domain: D;
  readonly path: string;
}

function defineRoute<D extends ApiDomain, Q extends QuerySchema = QuerySchema>(
  domain: D,
  def: ApiRouteDef<D, Q>,
): SourceEntry<D, Q> {
  return { domain, path: apiPaths[domain], ...def };
}

// The Hugging Face by-id lookup answers a miss with 200 + an empty list and keeps that answer at the source for one minute
// (see `partialWhen` in src/server/huggingface/source.ts), so the route hands such a payload the API's shortest windows —
// and takes them without `staleIfErrorS`, which would otherwise let the edge serve "not found" for a day.
const EMPTY_LIST_DURATIONS: CacheDurations = SHORTEST_CACHE_DURATIONS;
const ENTRIES = {
  artificialIndex: defineRoute("artificialIndex", {
    cache: cacheDurationsForTtl(ARTIFICIAL_INDEX_TTL_MS),
    handler: getIntelligenceIndex,
  }),
  homeDashboard: defineRoute("homeDashboard", {
    cache: cacheDurationsForTtl(HOME_DASHBOARD_TTL_MS),
    handler: getHomeDashboard,
  }),
  news: defineRoute("news", {
    query: { category: qEnum(NEWS_CATEGORIES) },
    cache: cacheDurationsForTtl(NEWS_CATEGORY_TTL_MS),
    handler: getNews,
  }),

  openSourceModels: defineRoute("openSourceModels", {
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      id: qStr({ maxLength: MAX_MODEL_ID_CHARS, optional: true }),
    },
    cache: cacheDurationsForTtl(OPEN_SOURCE_MODELS_TTL_MS),
    // `getOpenSourceModels` answers 200 + an empty list for an id that does not exist; that miss is only kept for a
    // minute, so it must not inherit the list TTL.
    cacheFor: (payload) => (payload.data.length === 0 ? EMPTY_LIST_DURATIONS : undefined),
    handler: getOpenSourceModels,
  }),
  closedReleases: defineRoute("closedReleases", {
    cache: cacheDurationsForTtl(CLOSED_RELEASES_TTL_MS),
    handler: getClosedReleases,
  }),
  openRouterRankings: defineRoute("openRouterRankings", {
    cache: cacheDurationsForTtl(OPENROUTER_RANKINGS_TTL_MS),
    handler: getOpenRouterRankings,
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

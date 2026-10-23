import type { ApiRouteDef } from "./api/router";
import { cacheHeadersForTtl } from "./api/headers";
import { qEnum, qStr, type QuerySchema } from "./api/validation";
import type { ApiDomain } from "@/shared/contract";
import {
  apiPaths,
  FIVE_MINUTES,
  MAX_MODEL_ID_CHARS,
  NEWS_CATEGORIES,
  NEWS_TTL_MS,
  OPEN_SOURCE_MODELS_DEFAULTS,
  ONE_HOUR,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
} from "@/shared/config";
import { OPEN_SOURCE_SORTS } from "@/shared/query-schemas";
import { getIntelligenceIndex } from "./aa";

import { getClosedReleases } from "./releases/source";
import { getHomeDashboard } from "./home/source";
import { getNews } from "./news/source";
import { getOpenSourceModels } from "./huggingface/source";
import { getOpenRouterRankings } from "./openrouter/rankings";

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

const ENTRIES = {
  artificialIndex: defineRoute("artificialIndex", {
    cache: cacheHeadersForTtl(ONE_HOUR),
    handler: getIntelligenceIndex,
  }),
  homeDashboard: defineRoute("homeDashboard", {
    cache: cacheHeadersForTtl(FIVE_MINUTES),
    handler: getHomeDashboard,
  }),
  news: defineRoute("news", {
    query: { category: qEnum(NEWS_CATEGORIES) },
    cache: cacheHeadersForTtl(NEWS_TTL_MS),
    handler: getNews,
  }),

  openSourceModels: defineRoute("openSourceModels", {
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      id: qStr({ maxLength: MAX_MODEL_ID_CHARS, optional: true }),
    },
    cache: cacheHeadersForTtl(SLOW_TTL_MS),
    handler: getOpenSourceModels,
  }),
  closedReleases: defineRoute("closedReleases", {
    cache: cacheHeadersForTtl(STATIC_TTL_MS),
    handler: getClosedReleases,
  }),
  openRouterRankings: defineRoute("openRouterRankings", {
    cache: cacheHeadersForTtl(ONE_HOUR),
    handler: getOpenRouterRankings,
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

import type { ApiRouteDef } from "./api/router";
import { qEnum, qStr, type QuerySchema } from "./api/validation";
import type { ApiDomain } from "@/shared/contract";
import { apiPaths, MAX_ID_CHARS, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { OPEN_SOURCE_SORTS } from "@/shared/query-schemas";
import { getIntelligenceIndex } from "./aa";

import { getClosedReleases } from "./releases/source";
import { getHomeDashboard } from "./home/source";
import { getNews } from "./news/source";
import { getModelsForQuery } from "./huggingface/source";
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
    handler: (ctx) => getNews(ctx),
  }),

  openSourceModels: defineSource("openSourceModels", {
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      id: qStr({ maxLength: MAX_ID_CHARS, optional: true }),
    },
    handler: (ctx, params) => getModelsForQuery(ctx, params),
  }),
  closedReleases: defineSource("closedReleases", {
    handler: (ctx) => getClosedReleases(ctx),
  }),
  openRouterRankings: defineSource("openRouterRankings", {
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

import type { AppContext } from "@/server/context";
import { qEnum, qStr, type QuerySchema, type ValidatedQuery } from "@/server/infra/query-validation";
import { SHORT_CACHE_HEADERS } from "@/server/http/headers";
import type { ApiDomain, DomainPayload } from "@/shared/contract";
import { apiPaths, MAX_NAME_CHARS, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { OPEN_SOURCE_SORTS, SORT_DIRECTIONS } from "@/shared/api/query-schemas";
import { getIntelligenceIndex } from "@/server/sources/aa";

import { getClosedReleases } from "@/server/sources/closed-releases-source";
import { getHomeDashboard } from "@/server/sources/home-source";
import { getNews } from "@/server/sources/news-source";
import { getModelById, getModels } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";

interface SourceDefinition<D extends ApiDomain, Q extends QuerySchema> {
  query?: Q;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<Q>): Promise<DomainPayload<D>>;
}

interface SourceEntry<D extends ApiDomain = ApiDomain, Q extends QuerySchema = QuerySchema> extends SourceDefinition<
  D,
  Q
> {
  readonly domain: D;
  readonly path: string;
}

function defineSource<D extends ApiDomain, Q extends QuerySchema = QuerySchema>(
  domain: D,
  def: SourceDefinition<D, Q>,
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

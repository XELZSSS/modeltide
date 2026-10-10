import type { AppContext } from "@/server/context";
import { qEnum, qNum, qStr, type QuerySchema, type ValidatedQuery } from "@/server/infra/query-validation";
import { SHORT_CACHE_HEADERS } from "@/server/http/headers";
import type { ApiDomain, DomainPayload } from "@/shared/contract";
import {
  apiPaths,
  MAX_MODEL_LIMIT,
  MAX_NAME_CHARS,
  NEWS_CATEGORIES,
  OPEN_SOURCE_MODELS_DEFAULTS,
} from "@/shared/config";
import { getAgentRankings } from "@/server/sources/agent-arena-source";
import { getIntelligenceIndex } from "@/server/sources/aa";
import { getClosedReleases } from "@/server/sources/closed-releases-source";
import { getHomeDashboard } from "@/server/sources/home-source";
import { getNews } from "@/server/sources/news-source";
import { getModelById, getModels } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { getSourceIncidentLog } from "@/server/sources/incident-log-source";
import { getStatusHistory } from "@/server/sources/status-history";

interface SourceDefinition<D extends ApiDomain, Q extends QuerySchema> {
  query?: Q;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<Q>): Promise<DomainPayload<D>>;
}

export interface SourceEntry<
  D extends ApiDomain = ApiDomain,
  Q extends QuerySchema = QuerySchema,
> extends SourceDefinition<D, Q> {
  readonly domain: D;
  readonly path: string;
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1"] as const;

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
  agentRankings: defineSource("agentRankings", {
    handler: (ctx) => getAgentRankings(ctx),
  }),
  openSourceModels: defineSource("openSourceModels", {
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
  statusHistory: defineSource("statusHistory", {
    cache: SHORT_CACHE_HEADERS,
    handler: (ctx) => getStatusHistory(ctx),
  }),
  sourceIncidents: defineSource("sourceIncidents", {
    query: { id: qStr({ maxLength: MAX_NAME_CHARS }) },
    handler: (ctx, params) => getSourceIncidentLog(ctx, params.id),
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

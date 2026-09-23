import type { AppContext } from "@/server/context";
import { buildContext, type Env } from "@/server/context";
import { qEnum, qNum, qStr, type QuerySchema, type ValidatedQuery } from "@/server/infra/query-validation";
import type { ApiDomain, DomainPayload } from "@/contract/api-contract";
import { apiPaths, MAX_MODEL_LIMIT, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { getAgentRankings } from "@/server/sources/agent-arena-source";
import { getIntelligenceIndex } from "@/server/sources/aa/index-source";
import { getClosedReleases } from "@/server/sources/closed-releases-source";
import { getHomeDashboard } from "@/server/sources/home-source";
import { getNews } from "@/server/sources/news-source";
import { getModelById, getModels, getReleases } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { getStatusHistory } from "@/server/sources/status-history";

export type WarmTier = "core" | "hourly" | "static";

interface SourceDefinition<D extends ApiDomain, Q extends QuerySchema> {
  query?: Q;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<Q>): Promise<DomainPayload<D>>;
  warm?: WarmTier;
  warmParams?: ValidatedQuery<Q>[];
}

interface SourceEntry<D extends ApiDomain = ApiDomain, Q extends QuerySchema = QuerySchema> extends SourceDefinition<
  D,
  Q
> {
  readonly domain: D;
  readonly path: string;
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
// Upstream rejects ascending sort ("only descending sort is supported"): -1 only.
const SORT_DIRECTIONS = ["-1"] as const;

/** The payload type comes from `ApiContract`, not a hand-written type argument: route and contract cannot drift. */
function defineSource<D extends ApiDomain, Q extends QuerySchema = QuerySchema>(
  domain: D,
  def: SourceDefinition<D, Q>,
): SourceEntry<D, Q> {
  return { domain, path: apiPaths[domain], ...def };
}

/** Keyed by API domain: `satisfies` makes a missing route a compile error. */
const ENTRIES = {
  artificialIndex: defineSource("artificialIndex", {
    handler: (ctx) => getIntelligenceIndex(ctx),
    warm: "core",
  }),
  homeDashboard: defineSource("homeDashboard", {
    handler: (ctx) => getHomeDashboard(ctx),
    warm: "core",
  }),
  news: defineSource("news", {
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    handler: (ctx, params) => getNews(ctx, params.category),
    warm: "hourly",
    warmParams: NEWS_CATEGORIES.map((category) => ({ category })),
  }),
  agentRankings: defineSource("agentRankings", {
    handler: (ctx) => getAgentRankings(ctx),
    warm: "hourly",
  }),
  openSourceReleases: defineSource("openSourceReleases", {
    handler: (ctx) => getReleases(ctx),
    warm: "hourly",
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
    warm: "hourly",
    warmParams: [{ ...OPEN_SOURCE_MODELS_DEFAULTS }],
  }),
  closedReleases: defineSource("closedReleases", {
    handler: (ctx) => getClosedReleases(ctx),
    warm: "static",
  }),
  openSourceModel: defineSource("openSourceModel", {
    query: { id: qStr({ maxLength: 200 }) },
    handler: (ctx, params) => getModelById(ctx, params.id),
  }),
  openRouterRankings: defineSource("openRouterRankings", {
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  statusHistory: defineSource("statusHistory", {
    cache: {
      browser: "public, max-age=15",
      cdn: "public, max-age=30, stale-while-revalidate=30",
    },
    handler: (ctx) => getStatusHistory(ctx),
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

export function warmTasks(env: Env, tier: WarmTier, taskTimeoutMs: number): (() => Promise<unknown>)[] {
  const tasks: (() => Promise<unknown>)[] = [];
  for (const source of SOURCES) {
    if (source.warm !== tier) continue;
    const paramSets = source.warmParams?.length ? source.warmParams : [{} as ValidatedQuery<QuerySchema>];
    for (const params of paramSets) {
      // Per-call timeout so a slow upstream can't starve tasks sharing a deadline.
      tasks.push(() => source.handler(buildContext(env, { workSignal: AbortSignal.timeout(taskTimeoutMs) }), params));
    }
  }
  return tasks;
}

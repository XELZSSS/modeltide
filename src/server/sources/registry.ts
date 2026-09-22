import type { AppContext } from "@/server/context";
import { buildContext, type Env } from "@/server/context";
import { qEnum, qNum, qStr, type QuerySchema, type ValidatedQuery } from "@/server/infra/query-validation";
import { apiPaths, MAX_MODEL_LIMIT, NEWS_CATEGORIES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { getAgentRankings } from "@/server/sources/agent-arena-source";
import { getIntelligenceIndex } from "@/server/sources/aa/index-source";
import { getClosedReleases } from "@/server/sources/closed-releases-source";
import { getHomeDashboard } from "@/server/sources/home-source";
import { getNews } from "@/server/sources/news-source";
import { getOfficialPricing } from "@/server/sources/pricing-source";
import { getModelById, getModels, getReleases } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { getStatusHistory } from "@/server/sources/status-history";

export type WarmTier = "core" | "hourly" | "static";

interface SourceManifestEntry<Q extends QuerySchema = QuerySchema> {
  path: string;
  query?: Q;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<Q>): Promise<unknown>;
  warm?: WarmTier;
  warmParams?: ValidatedQuery<Q>[];
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
// Upstream rejects ascending order for every sort key ("only descending sort is
// supported"), so the enum admits only -1: a `direction=1` request now fails
// validation with a 400 instead of reaching Hugging Face and surfacing as a 502.
const SORT_DIRECTIONS = ["-1"] as const;

function defineSource<S extends QuerySchema>(entry: SourceManifestEntry<S>): SourceManifestEntry {
  return entry as SourceManifestEntry;
}

export const SOURCES: readonly SourceManifestEntry[] = [
  defineSource({
    path: apiPaths.artificialIndex,
    handler: (ctx) => getIntelligenceIndex(ctx),
    warm: "core",
  }),
  defineSource({
    path: apiPaths.homeDashboard,
    handler: (ctx) => getHomeDashboard(ctx),
    warm: "core",
  }),
  defineSource({
    path: apiPaths.news,
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    handler: (ctx, params) => getNews(ctx, params.category),
    warm: "hourly",
    warmParams: NEWS_CATEGORIES.map((category) => ({ category })),
  }),
  defineSource({
    path: apiPaths.agentRankings,
    handler: (ctx) => getAgentRankings(ctx),
    warm: "hourly",
  }),
  defineSource({
    path: apiPaths.openSourceReleases,
    handler: (ctx) => getReleases(ctx),
    warm: "hourly",
  }),
  defineSource({
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
    handler: (ctx, params) => getModels(ctx, params),
    warm: "hourly",
    warmParams: [{ ...OPEN_SOURCE_MODELS_DEFAULTS }],
  }),
  defineSource({
    path: apiPaths.officialPricing,
    handler: (ctx) => getOfficialPricing(ctx),
    warm: "static",
  }),
  defineSource({
    path: apiPaths.closedReleases,
    handler: (ctx) => getClosedReleases(ctx),
    warm: "static",
  }),
  defineSource({
    path: apiPaths.openSourceModel,
    query: { id: qStr({ maxLength: 200 }) },
    handler: (ctx, params) => getModelById(ctx, params.id),
  }),
  defineSource({
    path: apiPaths.openRouterRankings,
    handler: (ctx) => getOpenRouterRankings(ctx),
  }),
  defineSource({
    path: apiPaths.statusHistory,
    cache: {
      browser: "public, max-age=15",
      cdn: "public, max-age=30, stale-while-revalidate=30",
    },
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

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

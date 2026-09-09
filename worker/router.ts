import type { Env } from "@/server/context";
import { handleApiRoute } from "@/server/routes/define-route";
import type { QuerySchema, ValidatedQuery } from "@/server/infra/validation";
import type { AppContext } from "@/server/context";
import { apiPaths, MAX_MODEL_LIMIT, OPEN_SOURCE_MODELS_DEFAULTS, NEWS_CATEGORIES } from "@/shared/config";
import { qEnum, qNum, qStr } from "@/server/infra/validation";
import { ValidationError } from "@/server/infra/errors";
import { getAgentRankings } from "@/server/sources/agent-arena";
import { getIntelligenceIndex } from "@/server/sources/aa/intelligence-index";
import { getClosedReleases } from "@/server/sources/closed-releases";
import { getHomeDashboard } from "@/server/sources/home";
import { getNews } from "@/server/sources/news";
import { getOfficialPricing } from "@/server/sources/pricing";
import { getModelById, getModels, getReleases } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { getStatusHistory } from "@/server/sources/status-history";

export interface ApiRouteDef<S extends QuerySchema = QuerySchema> {
  query?: S;
  noStore?: boolean;
  cache?: { browser: string; cdn: string };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

interface ApiRoute {
  path: string;
  def: ApiRouteDef;
}

/**
 * Capture the query schema generics per definition so handler `params` keep
 * their literal types (the erased ApiRoute list loses them otherwise).
 */
function defineApiRoute<S extends QuerySchema>(path: string, def: ApiRouteDef<S>): ApiRoute {
  return { path, def: def as ApiRouteDef };
}

const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
const SORT_DIRECTIONS = ["-1", "1"] as const;

/** All /api endpoints, transcribed 1:1 from the former API route files. */
const API_ROUTES: readonly ApiRoute[] = [
  defineApiRoute(apiPaths.agentRankings, { handler: (ctx) => getAgentRankings(ctx) }),
  defineApiRoute(apiPaths.artificialIndex, { handler: (ctx) => getIntelligenceIndex(ctx) }),
  defineApiRoute(apiPaths.closedReleases, { handler: (ctx) => getClosedReleases(ctx) }),
  defineApiRoute(apiPaths.homeDashboard, { handler: (ctx) => getHomeDashboard(ctx) }),
  defineApiRoute(apiPaths.news, {
    query: { category: qEnum(NEWS_CATEGORIES, NEWS_CATEGORIES[0]) },
    handler: (ctx, params) => getNews(ctx, params.category),
  }),
  defineApiRoute(apiPaths.officialPricing, { handler: (ctx) => getOfficialPricing(ctx) }),
  defineApiRoute(apiPaths.openSourceModel, {
    query: { id: qStr({ maxLength: 200 }) },
    handler: (ctx, params) => {
      if (!params.id) throw new ValidationError('Query param "id" is required');
      return getModelById(ctx, params.id);
    },
  }),
  defineApiRoute(apiPaths.openSourceModels, {
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
  defineApiRoute(apiPaths.openSourceReleases, { handler: (ctx) => getReleases(ctx) }),
  defineApiRoute(apiPaths.openRouterRankings, { handler: (ctx) => getOpenRouterRankings(ctx) }),
  defineApiRoute(apiPaths.statusHistory, {
    cache: {
      browser: "public, max-age=15",
      cdn: "public, max-age=30, stale-while-revalidate=30",
    },
    handler: (ctx) => getStatusHistory(ctx),
  }),
];

/**
 * Dispatch /api requests to the matching route. Returns undefined when no
 * route matches so the entrypoint can render its own 404.
 */
export function handleApi(req: Request, env: Env, url: URL): Promise<Response> | undefined {
  const route = API_ROUTES.find((r) => r.path === url.pathname);
  if (!route) return undefined;
  return handleApiRoute(req, env, url.pathname, route.def);
}

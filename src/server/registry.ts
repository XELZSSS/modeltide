import type { ApiRouteDef } from "./api/router";
import { cacheDurationsForTtl, SHORTEST_CACHE_DURATIONS } from "./api/headers";
import { qEnum, qStr, type QuerySchema } from "./api/validation";
import type { ApiDomain } from "@/shared/contract";
import {
  apiPaths,
  FIVE_MINUTES,
  MAX_MODEL_ID_CHARS,
  NEWS_CATEGORIES,
  NEWS_TTL_MS,
  ONE_HOUR,
  OPEN_SOURCE_MODELS_DEFAULTS,
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
import { getDecisionIndex } from "./aa/decision";
import { getCursorBench } from "./cursorbench/source";
import { getCodingAgentRankings } from "./aa/coding-agents";

interface SourceEntry<D extends ApiDomain = ApiDomain, Q extends QuerySchema = QuerySchema> extends ApiRouteDef<D, Q> {
  readonly path: string;
}

/** The domain is the entry's own first argument, so a source definition never restates it. */
function defineRoute<D extends ApiDomain, Q extends QuerySchema = QuerySchema>(
  domain: D,
  def: Omit<ApiRouteDef<D, Q>, "domain">,
): SourceEntry<D, Q> {
  return { ...def, domain, path: apiPaths[domain] };
}

const ENTRIES = {
  artificialIndex: defineRoute("artificialIndex", {
    cache: cacheDurationsForTtl(ONE_HOUR),
    handler: getIntelligenceIndex,
  }),
  homeDashboard: defineRoute("homeDashboard", {
    cache: cacheDurationsForTtl(FIVE_MINUTES),
    handler: getHomeDashboard,
  }),
  news: defineRoute("news", {
    query: { category: qEnum(NEWS_CATEGORIES) },
    cache: cacheDurationsForTtl(NEWS_TTL_MS),
    handler: getNews,
  }),

  openSourceModels: defineRoute("openSourceModels", {
    query: {
      sort: qEnum(OPEN_SOURCE_SORTS, OPEN_SOURCE_MODELS_DEFAULTS.sort),
      id: qStr({ maxLength: MAX_MODEL_ID_CHARS, optional: true }),
    },
    cache: cacheDurationsForTtl(SLOW_TTL_MS),
    // `getOpenSourceModels` answers 200 + an empty list for an id that does not exist; that miss is kept for a minute and must not inherit the list TTL or a `staleIfErrorS`.
    cacheFor: (payload) => (payload.data.length === 0 ? SHORTEST_CACHE_DURATIONS : undefined),
    handler: getOpenSourceModels,
  }),
  closedReleases: defineRoute("closedReleases", {
    cache: cacheDurationsForTtl(STATIC_TTL_MS),
    handler: getClosedReleases,
  }),
  openRouterRankings: defineRoute("openRouterRankings", {
    cache: cacheDurationsForTtl(ONE_HOUR),
    handler: getOpenRouterRankings,
  }),
  decisionIndex: defineRoute("decisionIndex", {
    cache: cacheDurationsForTtl(ONE_HOUR),
    handler: getDecisionIndex,
  }),
  cursorBench: defineRoute("cursorBench", {
    cache: cacheDurationsForTtl(STATIC_TTL_MS),
    handler: getCursorBench,
  }),
  // AA's coding-agent index: a separate upstream page from the intelligence index, cached for the hour the source asks for.
  codingAgentRankings: defineRoute("codingAgentRankings", {
    cache: cacheDurationsForTtl(ONE_HOUR),
    handler: getCodingAgentRankings,
  }),
} satisfies Record<ApiDomain, unknown>;

export const SOURCES: readonly SourceEntry[] = Object.values(ENTRIES);

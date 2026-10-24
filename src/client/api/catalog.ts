import {
  FIVE_MINUTES,
  NEWS_TTL_MS,
  ONE_MINUTE,
  OPEN_SOURCE_MODELS_DEFAULTS,
  PARTIAL_FAIL_TTL_MS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  queryKeys,
} from "@/shared/config";
import { openSourceModelsQueryString } from "@/shared/query-schemas";
import { isPartialPayload } from "./payload-normalize";
import { createApiQuery } from "./factory";
import { LruCache } from "@/client/utils/lru";
import type { NewsCategory } from "@/shared/types";

export const qArtificialList = createApiQuery("artificialIndex", queryKeys.artificialIndex, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qOpenRouterList = createApiQuery("openRouterRankings", queryKeys.openRouterRankings, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

// The dashboard's client TTL must match its origin TTL (`FIVE_MINUTES`): a longer one let the tab keep serving a copy
// the server had already replaced. Every other domain here holds for at most the server TTL — see
// `cacheDurationsForTtl`. How long a payload stays resident after it goes stale is `createApiQuery`'s default, not a
// per-domain decision.
export const qHomeDashboard = createApiQuery("homeDashboard", queryKeys.homeDashboard, {
  ttl: FIVE_MINUTES,
  partialRefetchMs: ONE_MINUTE,
  isPartialData: isPartialPayload,
});

const OPEN_SOURCE_SORT = OPEN_SOURCE_MODELS_DEFAULTS.sort;

export const qOpenSourceModelsList = createApiQuery("openSourceModels", queryKeys.openSourceModels(OPEN_SOURCE_SORT), {
  ttl: SLOW_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
  query: openSourceModelsQueryString(OPEN_SOURCE_SORT),
});

function memoQuery<K extends string, T>(
  max: number,
  resolveKey: (input: string) => K,
  create: (key: K) => T,
): (input: string) => T {
  const cache = new LruCache<K, T>(max);
  return (input: string) => {
    const key = resolveKey(input);
    return cache.get(key) ?? cache.set(key, create(key));
  };
}

type NewsQuery = ReturnType<typeof createApiQuery<"news">>;

/**
 * One query per news category. The API serves a single category per request (firing all 14 feeds at once was the heaviest
 * thing an invocation did), so each tab owns its cache entry, its partial flag and its refetch timing.
 */
export const qNewsByCategory: (category: NewsCategory) => NewsQuery = memoQuery<NewsCategory, NewsQuery>(
  8,
  (category) => category as NewsCategory,
  (category): NewsQuery =>
    createApiQuery("news", queryKeys.news(category), {
      ttl: NEWS_TTL_MS,
      partialRefetchMs: PARTIAL_FAIL_TTL_MS,
      isPartialData: isPartialPayload,
      query: { category },
    }),
);

export const qClosedReleasesList = createApiQuery("closedReleases", queryKeys.closedReleases, {
  ttl: STATIC_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

type OpenSourceModelQuery = ReturnType<typeof createApiQuery<"openSourceModels">>;

export const qOpenSourceModelById: (id: string) => OpenSourceModelQuery = memoQuery<string, OpenSourceModelQuery>(
  64,
  (id) => id,
  (id: string): OpenSourceModelQuery =>
    createApiQuery("openSourceModels", queryKeys.openSourceModels(OPEN_SOURCE_SORT, id), {
      ttl: FIVE_MINUTES,
      partialRefetchMs: PARTIAL_FAIL_TTL_MS,
      isPartialData: isPartialPayload,
      query: openSourceModelsQueryString(OPEN_SOURCE_SORT, id),
    }),
);

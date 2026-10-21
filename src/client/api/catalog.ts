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

export const qArtificialList = createApiQuery("artificialIndex", queryKeys.artificialIndex, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qOpenRouterList = createApiQuery("openRouterRankings", queryKeys.openRouterRankings, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qHomeDashboard = createApiQuery("homeDashboard", queryKeys.homeDashboard, {
  ttl: FIVE_MINUTES,
  gcTime: 15 * 60_000,
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
  const entries = new Map<K, T>();
  return (input: string) => {
    const key = resolveKey(input);
    const existing = entries.get(key);
    if (existing !== undefined) {
      entries.delete(key);
      entries.set(key, existing);
      return existing;
    }
    const created = create(key);
    entries.set(key, created);
    if (entries.size > max) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    return created;
  };
}

/** Every news category ships in one payload, so a single query backs all four tabs. */
export const qNews = createApiQuery("news", queryKeys.news, {
  ttl: NEWS_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qClosedReleasesList = createApiQuery("closedReleases", queryKeys.closedReleases, {
  ttl: STATIC_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

type OpenSourceModelQuery = ReturnType<typeof createApiQuery<"openSourceModels">>;

/** Single-model lookup rides the list endpoint (`?id=`), so both share one payload shape. */
export const qOpenSourceModelById: (id: string) => OpenSourceModelQuery = memoQuery<string, OpenSourceModelQuery>(
  64,
  (id) => id,
  (id: string): OpenSourceModelQuery =>
    createApiQuery("openSourceModels", queryKeys.openSourceModels(OPEN_SOURCE_SORT, id), {
      ttl: ONE_MINUTE,
      query: openSourceModelsQueryString(OPEN_SOURCE_SORT, id),
    }),
);

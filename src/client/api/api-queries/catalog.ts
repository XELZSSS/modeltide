import {
  FIVE_MINUTES,
  NEWS_CATEGORIES,
  NEWS_TTL_MS,
  ONE_MINUTE,
  OPEN_SOURCE_MODELS_DEFAULTS,
  PARTIAL_FAIL_TTL_MS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  STATUS_TTL_MS,
  queryKeys,
} from "@/shared/config";
import type { NewsCategory } from "@/shared/types";
import { isPartialPayload } from "@/client/api/payload-normalize";
import { createApiQuery } from "./factory";

export const qArtificialRaw = createApiQuery("artificialIndex", queryKeys.artificialIndex, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qOpenRouter = createApiQuery("openRouterRankings", queryKeys.openRouterRankings, {
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

export const qHomeDashboardRaw = createApiQuery("homeDashboard", queryKeys.homeDashboard, {
  ttl: FIVE_MINUTES,
  gcTime: 15 * 60_000,
  partialRefetchMs: ONE_MINUTE,
  isPartialData: isPartialPayload,
});

export const qOpenSourceModelsRaw = createApiQuery("openSourceModels", queryKeys.openSourceModels, {
  ttl: SLOW_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
  query: {
    sort: OPEN_SOURCE_MODELS_DEFAULTS.sort,
    direction: OPEN_SOURCE_MODELS_DEFAULTS.direction,
    limit: String(OPEN_SOURCE_MODELS_DEFAULTS.limit),
  },
});

export function qNewsRaw(category: NewsCategory) {
  const resolved = (NEWS_CATEGORIES.includes(category) ? category : NEWS_CATEGORIES[0]) as NewsCategory;
  return createApiQuery("news", queryKeys.news(resolved), {
    ttl: NEWS_TTL_MS,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
    query: { category: resolved },
  });
}

export const qStatusHistory = createApiQuery("statusHistory", queryKeys.statusHistory, {
  ttl: STATUS_TTL_MS,
  refetchMs: ONE_MINUTE,
});

export const qAgent = createApiQuery("agentRankings", queryKeys.agentRankings, {
  ttl: SLOW_TTL_MS,
});

export const qClosedReleasesRaw = createApiQuery("closedReleases", queryKeys.closedReleases, {
  ttl: STATIC_TTL_MS,
  partialRefetchMs: PARTIAL_FAIL_TTL_MS,
  isPartialData: isPartialPayload,
});

type OpenSourceModelQuery = ReturnType<typeof createApiQuery<"openSourceModel">>;

const openSourceModelQueries = new Map<string, OpenSourceModelQuery>();

export function qOpenSourceModel(id: string): OpenSourceModelQuery {
  const existing = openSourceModelQueries.get(id);
  if (existing) return existing;
  const created = createApiQuery("openSourceModel", queryKeys.openSourceModel(id), {
    ttl: ONE_MINUTE,
    query: { id },
  });
  openSourceModelQueries.set(id, created);
  return created;
}

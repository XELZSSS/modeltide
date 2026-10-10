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

type NewsQuery = ReturnType<typeof createApiQuery<"news">>;

const newsQueries = new Map<NewsCategory, NewsQuery>();

export function qNewsRaw(category: NewsCategory): NewsQuery {
  const resolved = (NEWS_CATEGORIES.includes(category) ? category : NEWS_CATEGORIES[0]) as NewsCategory;
  const existing = newsQueries.get(resolved);
  if (existing) return existing;
  const created = createApiQuery("news", queryKeys.news(resolved), {
    ttl: NEWS_TTL_MS,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
    query: { category: resolved },
  });
  newsQueries.set(resolved, created);
  return created;
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

const MAX_MODEL_QUERIES = 64;

const openSourceModelQueries = new Map<string, OpenSourceModelQuery>();

export function qOpenSourceModel(id: string): OpenSourceModelQuery {
  const existing = openSourceModelQueries.get(id);
  if (existing) {
    openSourceModelQueries.delete(id);
    openSourceModelQueries.set(id, existing);
    return existing;
  }
  const created = createApiQuery("openSourceModel", queryKeys.openSourceModel(id), {
    ttl: ONE_MINUTE,
    query: { id },
  });
  openSourceModelQueries.set(id, created);
  if (openSourceModelQueries.size > MAX_MODEL_QUERIES) {
    const oldest = openSourceModelQueries.keys().next().value;
    if (oldest !== undefined) openSourceModelQueries.delete(oldest);
  }
  return created;
}

type SourceIncidentsQuery = ReturnType<typeof createApiQuery<"sourceIncidents">>;

const MAX_INCIDENT_QUERIES = 32;

const sourceIncidentsQueries = new Map<string, SourceIncidentsQuery>();

export function qSourceIncidents(id: string): SourceIncidentsQuery {
  const existing = sourceIncidentsQueries.get(id);
  if (existing) {
    sourceIncidentsQueries.delete(id);
    sourceIncidentsQueries.set(id, existing);
    return existing;
  }
  const created = createApiQuery("sourceIncidents", queryKeys.sourceIncidents(id), {
    ttl: FIVE_MINUTES,
    query: { id },
  });
  sourceIncidentsQueries.set(id, created);
  if (sourceIncidentsQueries.size > MAX_INCIDENT_QUERIES) {
    const oldest = sourceIncidentsQueries.keys().next().value;
    if (oldest !== undefined) sourceIncidentsQueries.delete(oldest);
  }
  return created;
}

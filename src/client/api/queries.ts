import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  API_DOMAINS,
  FIFTEEN_MINUTES,
  FIVE_MINUTES,
  OPEN_SOURCE_MODELS_DEFAULTS,
  THIRTY_MINUTES,
} from "@/shared/config";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  HomeDashboardData,
  NewsCategory,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankingsPayload,
  StatusHistoryPayload,
} from "@/shared/types";
import { normalizePercent, dedupeBy } from "@/client/utils";
import { fetcher, apiPaths, type QueryCtx } from "./client";

// ============================================================================
// Query keys — derived from the shared API domain suffixes, the same source the
// server KV cache keys use (`cacheKeys` in shared/config), so the client/server
// naming can never drift apart.
// ============================================================================

export const queryKeys = {
  artificialIndex: ["api", API_DOMAINS.artificialIndex] as const,
  openSourceReleases: ["api", API_DOMAINS.openSourceReleases] as const,
  openRouterRankings: ["api", API_DOMAINS.openRouterRankings] as const,
  homeDashboard: ["api", API_DOMAINS.homeDashboard] as const,
  openSourceModels: (
    sort = OPEN_SOURCE_MODELS_DEFAULTS.sort,
    direction = OPEN_SOURCE_MODELS_DEFAULTS.direction,
    limit = OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ) =>
    ["api", API_DOMAINS.openSourceModels, sort, direction, limit] as const,
  statusHistory: ["api", API_DOMAINS.statusHistory] as const,
  news: (category: string) => ["api", API_DOMAINS.news, category] as const,
};

// ============================================================================
// Typed query factory
// ============================================================================

export interface ApiQueryOptions<T> {
  staleTime?: number;
  refetchInterval?: number | false;
  queryFn?: (ctx: QueryCtx) => Promise<T>;
}

/** Creates a typed query for `path` with `key`, exposing `use` and `useSuspense`. */
export function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { queryFn: customFn, ...rest } = opts ?? {};
  const queryFn = customFn ?? fetcher<T>(path);
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...rest, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...rest }),
  };
}

// ============================================================================
// Query definitions (staleTime matches the server TTLs)
// ============================================================================

export const qArtificial = createApiQuery<ArtificialAnalysisModel[]>(
  queryKeys.artificialIndex,
  apiPaths.artificialIndex,
  // Match the server's DEFAULT_TTL_MS (15 min): a longer staleTime would let a
  // long-lived tab show data well past the server's 4-min cron refresh.
  { staleTime: FIFTEEN_MINUTES, refetchInterval: FIFTEEN_MINUTES },
);
export const qOpenSourceReleases = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceReleases,
  apiPaths.openSourceReleases,
  { staleTime: FIFTEEN_MINUTES, refetchInterval: FIFTEEN_MINUTES },
);
export const qOpenRouter = createApiQuery<OpenRouterRankingsPayload>(
  queryKeys.openRouterRankings,
  apiPaths.openRouterRankings,
  { staleTime: FIFTEEN_MINUTES, refetchInterval: FIFTEEN_MINUTES },
);
export const qHomeDashboard = createApiQuery<HomeDashboardData>(queryKeys.homeDashboard, apiPaths.homeDashboard, {
  staleTime: FIFTEEN_MINUTES,
  refetchInterval: FIFTEEN_MINUTES,
});
export const qOpenSourceModels = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceModels(),
  apiPaths.openSourceModels(),
  { staleTime: FIFTEEN_MINUTES, refetchInterval: FIFTEEN_MINUTES },
);

// One stable query per category (module-level cache) instead of rebuilding the
// query — and its closures — on every render.
const newsQueries = new Map<NewsCategory, ReturnType<typeof createApiQuery<NewsItem[]>>>();
export const qNews = (c: NewsCategory) => {
  let q = newsQueries.get(c);
  if (!q) {
    q = createApiQuery<NewsItem[]>(queryKeys.news(c), apiPaths.news(c), {
      staleTime: THIRTY_MINUTES,
      refetchInterval: THIRTY_MINUTES,
    });
    newsQueries.set(c, q);
  }
  return q;
};

// The rolling store updates on the 4-minute cron; a 5-minute staleTime keeps one
// sample of headroom before the client refetches.
export const qStatusHistory = createApiQuery<StatusHistoryPayload>(queryKeys.statusHistory, apiPaths.statusHistory, {
  staleTime: FIVE_MINUTES,
  refetchInterval: FIVE_MINUTES,
});
// ============================================================================
// Derived hooks — combine or transform the queries above
// ============================================================================

export const useArtificialRankings = qArtificial.use;
export const useSuspenseArtificialRankings = qArtificial.useSuspense;
export const useSuspenseHomeDashboard = qHomeDashboard.useSuspense;
export const useOpenRouterRankings = qOpenRouter.use;
export const useSuspenseOpenRouterRankings = qOpenRouter.useSuspense;
export const useSuspenseOpenSourceModels = qOpenSourceModels.useSuspense;
export const useSuspenseOpenSourceReleases = qOpenSourceReleases.useSuspense;
export const useStatusHistory = qStatusHistory.use;
export const useSuspenseStatusHistory = qStatusHistory.useSuspense;
export const useNewsByCategory = (c: NewsCategory) => qNews(c).use();
export const useSuspenseNewsByCategory = (c: NewsCategory) => qNews(c).useSuspense();

export interface OpenSourceModelsQuery {
  data: OpenSourceModelEntry[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

/** Merges trending and release lists, de-duplicating by model id so each model appears once. Supports partial data while one query is still pending. */
export function useAllOpenSourceModels(enabled = true): OpenSourceModelsQuery {
  const trending = qOpenSourceModels.use(enabled);
  const releases = qOpenSourceReleases.use(enabled);

  const data = useMemo(
    () =>
      dedupeBy(
        [...(trending.data ?? []), ...(releases.data ?? [])].filter((m) => m.id),
        (m) => m.id,
      ),
    [trending.data, releases.data],
  );

  const hasData = data.length > 0;
  const isPending = enabled && !hasData && (trending.isPending || releases.isPending);
  const isError = enabled && !hasData && (trending.isError || releases.isError);
  const error = trending.error ?? releases.error ?? null;

  return {
    data,
    isPending,
    isError,
    error,
  };
}

// -- Hallucination rankings (derived from the Artificial Analysis payload) ----

// One entry per model that has an omniscience breakdown; models without one are skipped.
// Sorted by accuracy descending so the most reliable models rank first.
function buildHallucinationRankings(models: ArtificialAnalysisModel[]): HallucinationRankingEntry[] {
  return models
    .flatMap((model) => {
      const total = model.omniscience_breakdown?.total;
      if (total?.omniscience == null) return [];
      return [
        {
          id: model.id,
          slug: model.slug,
          model: model.name,
          hallucinationRate: normalizePercent(total.hallucination_rate),
          accuracy: normalizePercent(total.accuracy),
          attemptRate: normalizePercent(total.attempt_rate),
          omniscienceIndex: total.omniscience,
        },
      ];
    })
    .sort((a, b) => (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity));
}

/** Memoized hallucination rankings; empty until `enabled` and data are both present. */
export function useHallucinationRankings(data: ArtificialAnalysisModel[], enabled = true): HallucinationRankingEntry[] {
  return useMemo(() => (enabled && data.length > 0 ? buildHallucinationRankings(data) : []), [data, enabled]);
}

/**
 * Suspense wrapper combining the Artificial Analysis rankings query with the
 * hallucination rankings derived from it — the standard way to consume both.
 */
export function useSuspenseHallucinationRankings(): HallucinationRankingEntry[] {
  const { data } = useSuspenseArtificialRankings();
  return useHallucinationRankings(data);
}

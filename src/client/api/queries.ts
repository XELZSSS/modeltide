import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ARENA_BOARD_IDS,
  FIVE_MINUTES,
  NEWS_CATEGORIES,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  THIRTY_MINUTES,
  publicApiPaths as apiPaths,
} from "@/shared/config";
import { fetcher, type QueryCtx } from "@/client/api/client";
import { queryKeys } from "@/client/api/query-keys";
import type {
  ArenaBoardPayload,
  ArenaRankingsPayload,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  HomeDashboardData,
  NewsCategory,
  NewsItem,
  OfficialPricingPayload,
  OpenSourceModelEntry,
  OpenRouterRankingsPayload,
  StatusHistoryPayload,
} from "@/shared/types";
import { normalizePercent, dedupeBy } from "@/shared/utils";

interface ApiQueryOptions<T> {
  ttl?: number;
  staleTime?: number;
  gcTime?: number;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  queryFn?: (ctx: QueryCtx) => Promise<T>;
}

function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { queryFn: customFn, ttl, ...rest } = opts ?? {};
  const queryFn = customFn ?? fetcher<T>(path);
  const timing = { staleTime: ttl, refetchInterval: false as const, ...rest };
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...timing }),
  };
}

const qArtificial = createApiQuery<ArtificialAnalysisModel[]>(queryKeys.artificialIndex, apiPaths.artificialIndex, {
  ttl: THIRTY_MINUTES,
});
const qOpenSourceReleases = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceReleases,
  apiPaths.openSourceReleases,
  { ttl: SLOW_TTL_MS },
);
const qOpenRouter = createApiQuery<OpenRouterRankingsPayload>(
  queryKeys.openRouterRankings,
  apiPaths.openRouterRankings,
  { ttl: THIRTY_MINUTES },
);
const qHomeDashboard = createApiQuery<HomeDashboardData>(queryKeys.homeDashboard, apiPaths.homeDashboard, {
  ttl: FIVE_MINUTES,
});
const qOpenSourceModels = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceModels,
  apiPaths.openSourceModels,
  { ttl: SLOW_TTL_MS },
);

function cachedQuery<K extends string, T>(
  cache: Map<K, ReturnType<typeof createApiQuery<T>>>,
  category: string,
  valid: readonly string[],
  build: (safe: K) => ReturnType<typeof createApiQuery<T>>,
): ReturnType<typeof createApiQuery<T>> {
  const safe = (valid.includes(category) ? category : valid[0]!) as K;
  let q = cache.get(safe);
  if (!q) {
    q = build(safe);
    cache.set(safe, q);
  }
  return q;
}

const newsQueries = new Map<NewsCategory, ReturnType<typeof createApiQuery<NewsItem[]>>>();
const qNews = (c: NewsCategory) =>
  cachedQuery(newsQueries, c, NEWS_CATEGORIES, (safe) =>
    createApiQuery<NewsItem[]>(queryKeys.news(safe), apiPaths.news(safe), { ttl: THIRTY_MINUTES }),
  );

const qStatusHistory = createApiQuery<StatusHistoryPayload>(queryKeys.statusHistory, apiPaths.statusHistory, {
  ttl: FIVE_MINUTES,
  refetchInterval: FIVE_MINUTES,
  refetchIntervalInBackground: false,
});
const qArena = createApiQuery<ArenaRankingsPayload>(queryKeys.arenaRankings, apiPaths.arenaRankings, {
  ttl: SLOW_TTL_MS,
});
export const qOfficialPricing = createApiQuery<OfficialPricingPayload>(
  queryKeys.officialPricing,
  apiPaths.officialPricing,
  { ttl: STATIC_TTL_MS, gcTime: STATIC_TTL_MS },
);
const qClosedReleases = createApiQuery<ClosedReleaseEntry[]>(queryKeys.closedReleases, apiPaths.closedReleases, {
  ttl: STATIC_TTL_MS,
  gcTime: STATIC_TTL_MS,
});

const boardQueries = new Map<string, ReturnType<typeof createApiQuery<ArenaBoardPayload>>>();
const qArenaBoard = (category: string) =>
  cachedQuery(boardQueries, category, ARENA_BOARD_IDS, (safe) =>
    createApiQuery<ArenaBoardPayload>(queryKeys.arenaBoard(safe), apiPaths.arenaBoard(safe), { ttl: SLOW_TTL_MS }),
  );
export const useArtificialRankings = qArtificial.use;
export const useSuspenseArtificialRankings = qArtificial.useSuspense;
export const useSuspenseHomeDashboard = qHomeDashboard.useSuspense;
export const useOpenRouterRankings = qOpenRouter.use;
export const useSuspenseOpenRouterRankings = qOpenRouter.useSuspense;
export const useSuspenseOpenSourceModels = qOpenSourceModels.useSuspense;
export const useSuspenseOpenSourceReleases = qOpenSourceReleases.useSuspense;
export const useSuspenseStatusHistory = qStatusHistory.useSuspense;
export const useSuspenseNewsByCategory = (c: NewsCategory) => qNews(c).useSuspense();
export const useSuspenseArenaRankings = qArena.useSuspense;
export const useSuspenseClosedReleases = qClosedReleases.useSuspense;
export const useSuspenseArenaBoard = (category: string) => qArenaBoard(category).useSuspense();

interface OpenSourceModelsQuery {
  data: OpenSourceModelEntry[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

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
  const error = isError ? (trending.error ?? releases.error ?? null) : null;

  return {
    data,
    isPending,
    isError,
    error,
  };
}

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

export function useHallucinationRankings(data: ArtificialAnalysisModel[], enabled = true): HallucinationRankingEntry[] {
  return useMemo(() => (enabled && data.length > 0 ? buildHallucinationRankings(data) : []), [data, enabled]);
}

export function useSuspenseHallucinationRankings(): HallucinationRankingEntry[] {
  const { data } = useSuspenseArtificialRankings();
  return useHallucinationRankings(data);
}

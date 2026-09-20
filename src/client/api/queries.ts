"use client";
import { useQuery, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  FIVE_MINUTES,
  NEWS_CATEGORIES,
  ONE_MINUTE,
  PARTIAL_FAIL_TTL_MS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  THIRTY_MINUTES,
  publicApiPaths as apiPaths,
} from "@/shared/config";
import { fetcher } from "@/client/api/client";
import { buildHallucinationRankings } from "@/client/utils/hallucination";
import { queryKeys } from "@/shared/config";
import type {
  AgentRankingsPayload,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  HomeDashboardData,
  NewsCategory,
  NewsItem,
  OfficialPricingPayload,
  OpenSourceModelEntry,
  OpenRouterRankingsPayload,
  SourcePayload,
  StatusHistoryPayload,
} from "@/shared/types";
import { dedupeBy } from "@/shared/utils";
import { normalizeHomeDashboard, unwrapList, unwrapListPartial } from "@/client/api/normalize";

interface ApiQueryOptions<T> {
  ttl?: number;
  staleTime?: number;
  gcTime?: number;
  partialRefetchMs?: number;
  isPartialData?: (data: T | undefined) => boolean;
}

function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { ttl, staleTime, gcTime, partialRefetchMs, isPartialData } = opts ?? {};
  const queryFn = fetcher<T>(path);
  const ttlMs = ttl ?? staleTime ?? THIRTY_MINUTES;
  const partialPoll: false | ((query: unknown) => number | false) =
    partialRefetchMs != null && isPartialData != null
      ? (query: unknown) => {
          const data = (query as { state?: { data?: T } } | null)?.state?.data;
          return isPartialData(data) ? partialRefetchMs : false;
        }
      : false;
  const timing = {
    gcTime: gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
    refetchInterval: partialPoll,
    staleTime: staleTime ?? ttlMs,
  };
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...timing }),
    prefetch: (qc: QueryClient) =>
      qc.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}

const qArtificialRaw = createApiQuery<SourcePayload<ArtificialAnalysisModel[]>>(
  queryKeys.artificialIndex,
  apiPaths.artificialIndex,
  {
    ttl: THIRTY_MINUTES,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: (d) => d?.partial === true,
  },
);
const qOpenSourceReleasesRaw = createApiQuery<SourcePayload<OpenSourceModelEntry[]>>(
  queryKeys.openSourceReleases,
  apiPaths.openSourceReleases,
  { ttl: SLOW_TTL_MS },
);
const qOpenRouter = createApiQuery<OpenRouterRankingsPayload>(
  queryKeys.openRouterRankings,
  apiPaths.openRouterRankings,
  {
    ttl: THIRTY_MINUTES,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: (d) => d?.partial === true,
  },
);
const qHomeDashboardRaw = createApiQuery<HomeDashboardData>(queryKeys.homeDashboard, apiPaths.homeDashboard, {
  ttl: FIVE_MINUTES,
  gcTime: 15 * 60_000,
  partialRefetchMs: ONE_MINUTE,
  isPartialData: (d) => d != null && (d.orRankings == null || d.textToImage == null || d.opensource == null),
});
const qOpenSourceModelsRaw = createApiQuery<SourcePayload<OpenSourceModelEntry[]>>(
  queryKeys.openSourceModels,
  apiPaths.openSourceModels,
  { ttl: SLOW_TTL_MS },
);

const qNewsRaw = (c: NewsCategory) => {
  const safe = (NEWS_CATEGORIES.includes(c) ? c : NEWS_CATEGORIES[0]) as NewsCategory;
  return createApiQuery<SourcePayload<NewsItem[]>>(queryKeys.news(safe), apiPaths.news(safe), {
    ttl: THIRTY_MINUTES,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: (d) => d?.partial === true,
  });
};

const qStatusHistory = createApiQuery<StatusHistoryPayload>(queryKeys.statusHistory, apiPaths.statusHistory, {
  ttl: FIVE_MINUTES,
});
const qAgent = createApiQuery<AgentRankingsPayload>(queryKeys.agentRankings, apiPaths.agentRankings, {
  ttl: SLOW_TTL_MS,
});
export const qOfficialPricing = createApiQuery<OfficialPricingPayload>(
  queryKeys.officialPricing,
  apiPaths.officialPricing,
  { ttl: STATIC_TTL_MS, gcTime: STATIC_TTL_MS },
);
const qClosedReleasesRaw = createApiQuery<SourcePayload<ClosedReleaseEntry[]>>(
  queryKeys.closedReleases,
  apiPaths.closedReleases,
  {
    ttl: STATIC_TTL_MS,
    gcTime: STATIC_TTL_MS,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: (d) => d?.partial === true,
  },
);

// ── Strict list hooks: unwrap at the boundary, components receive T[] only ──

// ── Strict list hooks: unwrap at the boundary, components receive T[] only ──

export function useArtificialRankings(enabled = true) {
  const q = qArtificialRaw.use(enabled);
  const unwrapped = useMemo(() => unwrapListPartial<ArtificialAnalysisModel>(q.data, "artificialIndex"), [q.data]);
  const hasData = unwrapped.data.length > 0;
  const isError = enabled && !hasData && !q.isPending && (q.isError || unwrapped.malformed);
  const error = isError ? (q.error ?? new Error("Malformed artificialIndex payload")) : null;
  return { ...q, data: unwrapped.data, isError, error };
}

export function useSuspenseArtificialRankings(): ArtificialAnalysisModel[] {
  const { data } = qArtificialRaw.useSuspense();
  return unwrapList<ArtificialAnalysisModel>(data, "artificialIndex");
}

export function useSuspenseHomeDashboard() {
  const { data } = qHomeDashboardRaw.useSuspense();
  return normalizeHomeDashboard(data);
}

export const useOpenRouterRankings = qOpenRouter.use;
export const useSuspenseOpenRouterRankings = qOpenRouter.useSuspense;

export function useSuspenseOpenSourceModels(): OpenSourceModelEntry[] {
  const { data } = qOpenSourceModelsRaw.useSuspense();
  return unwrapList<OpenSourceModelEntry>(data, "openSourceModels");
}

export function useSuspenseOpenSourceReleases(): OpenSourceModelEntry[] {
  const { data } = qOpenSourceReleasesRaw.useSuspense();
  return unwrapList<OpenSourceModelEntry>(data, "openSourceReleases");
}

const qOpenSourceModel = (id: string) =>
  createApiQuery<SourcePayload<OpenSourceModelEntry | null>>(
    queryKeys.openSourceModel(id),
    apiPaths.openSourceModel(id),
    { ttl: SLOW_TTL_MS },
  );

export function useSuspenseOpenSourceModel(id: string): OpenSourceModelEntry | null {
  const { data } = qOpenSourceModel(id).useSuspense();
  if (data == null || typeof data !== "object" || !("data" in data)) return null;
  return (data as SourcePayload<OpenSourceModelEntry | null>).data ?? null;
}

export function useSuspenseClosedReleases(): ClosedReleaseEntry[] {
  const { data } = qClosedReleasesRaw.useSuspense();
  return unwrapList<ClosedReleaseEntry>(data, "closedReleases");
}

export function useSuspenseClosedReleasesState(): { items: ClosedReleaseEntry[]; partial: boolean } {
  const { data } = qClosedReleasesRaw.useSuspense();
  const { data: items, partial } = unwrapListPartial<ClosedReleaseEntry>(data, "closedReleases");
  return { items, partial };
}

export function useSuspenseNewsState(category: NewsCategory): { items: NewsItem[]; partial: boolean } {
  const { data } = qNewsRaw(category).useSuspense();
  const { data: items, partial } = unwrapListPartial<NewsItem>(data, `news:${category}`);
  return { items, partial };
}

export const useSuspenseStatusHistory = qStatusHistory.useSuspense;
export const useSuspenseAgentRankings = qAgent.useSuspense;

interface OpenSourceModelsQuery {
  data: OpenSourceModelEntry[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

export function useAllOpenSourceModels(enabled = true): OpenSourceModelsQuery {
  const trending = qOpenSourceModelsRaw.use(enabled);
  const releases = qOpenSourceReleasesRaw.use(enabled);

  const trendingUnwrapped = useMemo(
    () => unwrapListPartial<OpenSourceModelEntry>(trending.data, "openSourceModels"),
    [trending.data],
  );
  const releasesUnwrapped = useMemo(
    () => unwrapListPartial<OpenSourceModelEntry>(releases.data, "openSourceReleases"),
    [releases.data],
  );
  const trendingList = trendingUnwrapped.data;
  const releasesList = releasesUnwrapped.data;

  const data = useMemo(
    () =>
      dedupeBy(
        [...trendingList, ...releasesList].filter((m) => m.id),
        (m) => m.id,
      ),
    [trendingList, releasesList],
  );

  const hasData = data.length > 0;
  const malformed = trendingUnwrapped.malformed || releasesUnwrapped.malformed;
  const isPending = enabled && !hasData && !malformed && (trending.isPending || releases.isPending);
  const isError =
    enabled &&
    !hasData &&
    (trending.isError || releases.isError || (malformed && !trending.isPending && !releases.isPending));
  const error = isError ? (trending.error ?? releases.error ?? new Error("Malformed open-source payload")) : null;

  return {
    data,
    isPending,
    isError,
    error,
  };
}

export function useHallucinationRankings(data: ArtificialAnalysisModel[], enabled = true): HallucinationRankingEntry[] {
  return useMemo(() => (enabled && data.length > 0 ? buildHallucinationRankings(data) : []), [data, enabled]);
}

export function useSuspenseHallucinationRankings(): HallucinationRankingEntry[] {
  const models = useSuspenseArtificialRankings();
  return useHallucinationRankings(models);
}

// ── Navigation prefetch: route → queries to warm on hover/focus ──

export const prefetchQueriesForRoute = (qc: QueryClient, pathname: string): void => {
  if (pathname === "/") {
    void qArtificialRaw.prefetch(qc);
    void qHomeDashboardRaw.prefetch(qc);
    void qClosedReleasesRaw.prefetch(qc);
    void qStatusHistory.prefetch(qc);
  } else if (pathname === "/models") {
    void qArtificialRaw.prefetch(qc);
    void qOpenRouter.prefetch(qc);
    void qOpenSourceModelsRaw.prefetch(qc);
    void qAgent.prefetch(qc);
  } else if (pathname === "/releases") {
    void qOpenSourceReleasesRaw.prefetch(qc);
    void qClosedReleasesRaw.prefetch(qc);
  } else if (pathname === "/status") {
    void qStatusHistory.prefetch(qc);
  } else if (pathname === "/price-compare") {
    void qArtificialRaw.prefetch(qc);
    void qOfficialPricing.prefetch(qc);
  } else if (pathname === "/compare") {
    void qArtificialRaw.prefetch(qc);
  }
};

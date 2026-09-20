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

const qNewsCache = new Map<NewsCategory, ReturnType<typeof createApiQuery<SourcePayload<NewsItem[]>>>>();
const qNewsRaw = (c: NewsCategory) => {
  const safe = (NEWS_CATEGORIES.includes(c) ? c : NEWS_CATEGORIES[0]) as NewsCategory;
  let q = qNewsCache.get(safe);
  if (!q) {
    q = createApiQuery<SourcePayload<NewsItem[]>>(queryKeys.news(safe), apiPaths.news(safe), {
      ttl: THIRTY_MINUTES,
      partialRefetchMs: PARTIAL_FAIL_TTL_MS,
      isPartialData: (d) => d?.partial === true,
    });
    qNewsCache.set(safe, q);
  }
  return q;
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

const qOpenSourceModelCache = new Map<string, ReturnType<typeof createApiQuery<SourcePayload<OpenSourceModelEntry | null>>>>();
const qOpenSourceModel = (id: string) => {
  let q = qOpenSourceModelCache.get(id);
  if (!q) {
    q = createApiQuery<SourcePayload<OpenSourceModelEntry | null>>(
      queryKeys.openSourceModel(id),
      apiPaths.openSourceModel(id),
      { ttl: SLOW_TTL_MS },
    );
    if (qOpenSourceModelCache.size > 200) qOpenSourceModelCache.clear();
    qOpenSourceModelCache.set(id, q);
  }
  return q;
};

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

// ── Shared unwrapped-list state: single place for partial/malformed/error logic ──

interface UnwrappedListState<T> {
  data: T[];
  partial: boolean;
  malformed: boolean;
}

function useUnwrappedPartial<T>(raw: unknown, label: string): UnwrappedListState<T> {
  return useMemo(() => unwrapListPartial<T>(raw, label), [raw, label]);
}

export function useAllOpenSourceModels(enabled = true): OpenSourceModelsQuery {
  const trending = qOpenSourceModelsRaw.use(enabled);
  const releases = qOpenSourceReleasesRaw.use(enabled);

  const trendingUnwrapped = useUnwrappedPartial<OpenSourceModelEntry>(trending.data, "openSourceModels");
  const releasesUnwrapped = useUnwrappedPartial<OpenSourceModelEntry>(releases.data, "openSourceReleases");
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

type PrefetchFn = (qc: QueryClient) => void;
interface RoutePrefetchEntry {
  match: (path: string) => boolean;
  run: PrefetchFn[];
}

const ROUTE_PREFETCH_MAP: RoutePrefetchEntry[] = [
  {
    match: (p) => p === "/",
    run: [
      (qc) => void qArtificialRaw.prefetch(qc),
      (qc) => void qHomeDashboardRaw.prefetch(qc),
      (qc) => void qClosedReleasesRaw.prefetch(qc),
      (qc) => void qStatusHistory.prefetch(qc),
    ],
  },
  {
    match: (p) => p === "/models",
    run: [
      (qc) => void qArtificialRaw.prefetch(qc),
      (qc) => void qOpenRouter.prefetch(qc),
      (qc) => void qOpenSourceModelsRaw.prefetch(qc),
      (qc) => void qAgent.prefetch(qc),
      (qc) => void qOfficialPricing.prefetch(qc),
    ],
  },
  {
    match: (p) => p === "/releases",
    run: [(qc) => void qOpenSourceReleasesRaw.prefetch(qc), (qc) => void qClosedReleasesRaw.prefetch(qc)],
  },
  {
    match: (p) => p === "/news",
    run: [
      (qc) => {
        for (const c of NEWS_CATEGORIES) void qNewsRaw(c).prefetch(qc);
      },
    ],
  },
  {
    match: (p) => p === "/status" || p.startsWith("/status/"),
    run: [(qc) => void qStatusHistory.prefetch(qc)],
  },
  {
    match: (p) => p === "/price-compare" || p === "/compare",
    run: [(qc) => void qArtificialRaw.prefetch(qc), (qc) => void qOfficialPricing.prefetch(qc)],
  },
  {
    match: (p) => p.startsWith("/model/"),
    run: [
      (qc) => void qArtificialRaw.prefetch(qc),
      (qc) => void qOpenRouter.prefetch(qc),
      (qc) => void qOfficialPricing.prefetch(qc),
    ],
  },
];

export const prefetchQueriesForRoute = (qc: QueryClient, pathname: string): void => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const entry of ROUTE_PREFETCH_MAP) {
    if (entry.match(path)) {
      for (const fn of entry.run) fn(qc);
      return;
    }
  }
};

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
import { fetcher } from "@/client/api/api-client";
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
import { dedupeBy, isPartialDashboard } from "@/shared/utils";
import {
  isPartialPayload,
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
} from "@/client/api/payload-normalize";

interface ApiQueryOptions<T> {
  ttl?: number;
  gcTime?: number;
  partialRefetchMs?: number;
  isPartialData?: (data: T | undefined) => boolean;
}

/**
 * Consecutive `partial: true` responses tolerated before a permanently degraded upstream
 * stops being polled: ~25 min of self-healing at `PARTIAL_FAIL_TTL_MS` (5 min), after
 * which the view keeps the stale-but-usable payload rather than re-requesting a dead leg.
 */
export const MAX_PARTIAL_POLLS = 5;

/** Settled-fetch count at which each query's current partial streak started. */
const partialPollBases = new WeakMap<object, number>();

/**
 * `refetchInterval` for a payload that may arrive with `partial: true`: polls up to
 * `MAX_PARTIAL_POLLS` further fetches, then gives up. Only a settled fetch counts as a poll
 * — React Query re-evaluates this callback on every render, so calls would burn the cap.
 */
export function partialPollInterval<T>(
  query: unknown,
  isPartialData: (data: T | undefined) => boolean,
  partialRefetchMs: number,
  bases: WeakMap<object, number> = partialPollBases,
): number | false {
  if (query == null || typeof query !== "object") return false;
  const state = (query as { state?: { data?: T; dataUpdateCount?: number; errorUpdateCount?: number } }).state;
  if (!isPartialData(state?.data)) {
    bases.delete(query);
    return false;
  }
  const settled = (state?.dataUpdateCount ?? 0) + (state?.errorUpdateCount ?? 0);
  const base = bases.get(query) ?? settled;
  bases.set(query, base);
  return settled - base >= MAX_PARTIAL_POLLS ? false : partialRefetchMs;
}

function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { ttl, gcTime, partialRefetchMs, isPartialData } = opts ?? {};
  const queryFn = fetcher<T>(path);
  const ttlMs = ttl ?? THIRTY_MINUTES;
  const partialPoll: false | ((query: unknown) => number | false) =
    partialRefetchMs != null && isPartialData != null
      ? (query: unknown) => partialPollInterval(query, isPartialData, partialRefetchMs)
      : false;
  const timing = {
    gcTime: gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
    refetchInterval: partialPoll,
    staleTime: ttlMs,
  };
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...timing }),
    prefetch: (qc: QueryClient) =>
      qc.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}

interface SuspenseQueryLike {
  useSuspense: () => { data: unknown };
}

/** `useSuspense*` hook unwrapping a `SourcePayload<T[]>` list. */
function suspenseList<T>(q: SuspenseQueryLike, label: string): () => T[] {
  return () => unwrapList<T>(q.useSuspense().data, label);
}

/** Same, but surfaces the payload `partial` flag alongside the rows. */
function suspenseListState<T>(q: SuspenseQueryLike, label: string): () => { items: T[]; partial: boolean } {
  return () => {
    const { data, partial } = unwrapListPartial<T>(q.useSuspense().data, label);
    return { items: data, partial };
  };
}

const qArtificialRaw = createApiQuery<SourcePayload<ArtificialAnalysisModel[]>>(
  queryKeys.artificialIndex,
  apiPaths.artificialIndex,
  {
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
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
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
  },
);
const qHomeDashboardRaw = createApiQuery<HomeDashboardData>(queryKeys.homeDashboard, apiPaths.homeDashboard, {
  ttl: FIVE_MINUTES,
  gcTime: 15 * 60_000,
  partialRefetchMs: ONE_MINUTE,
  isPartialData: (d) => d != null && isPartialDashboard(d),
});
const qOpenSourceModelsRaw = createApiQuery<SourcePayload<OpenSourceModelEntry[]>>(
  queryKeys.openSourceModels,
  apiPaths.openSourceModels,
  { ttl: SLOW_TTL_MS },
);

function qNewsRaw(c: NewsCategory) {
  const category = (NEWS_CATEGORIES.includes(c) ? c : NEWS_CATEGORIES[0]) as NewsCategory;
  return createApiQuery<SourcePayload<NewsItem[]>>(queryKeys.news(category), apiPaths.news(category), {
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
  });
}

const qStatusHistory = createApiQuery<StatusHistoryPayload>(queryKeys.statusHistory, apiPaths.statusHistory, {
  ttl: FIVE_MINUTES,
});
const qAgent = createApiQuery<AgentRankingsPayload>(queryKeys.agentRankings, apiPaths.agentRankings, {
  ttl: SLOW_TTL_MS,
});
export const qOfficialPricing = createApiQuery<OfficialPricingPayload>(
  queryKeys.officialPricing,
  apiPaths.officialPricing,
  { ttl: STATIC_TTL_MS },
);
const qClosedReleasesRaw = createApiQuery<SourcePayload<ClosedReleaseEntry[]>>(
  queryKeys.closedReleases,
  apiPaths.closedReleases,
  {
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
  },
);

export function useArtificialRankings(enabled = true) {
  const q = qArtificialRaw.use(enabled);
  const unwrapped = useUnwrappedPartial<ArtificialAnalysisModel>(q.data, "artificialIndex");
  const hasData = unwrapped.data.length > 0;
  const isError = enabled && !hasData && !q.isPending && (q.isError || unwrapped.malformed);
  const error = isError ? (q.error ?? new Error("Malformed artificialIndex payload")) : null;
  return { ...q, data: unwrapped.data, isError, error };
}

export const useSuspenseArtificialRankings = suspenseList<ArtificialAnalysisModel>(qArtificialRaw, "artificialIndex");

/** Same rows plus the payload's `partial` flag, for views that surface a notice. */
export const useSuspenseArtificialRankingsState = suspenseListState<ArtificialAnalysisModel>(
  qArtificialRaw,
  "artificialIndex",
);

export function useSuspenseHomeDashboard() {
  const { data } = qHomeDashboardRaw.useSuspense();
  return normalizeHomeDashboard(data);
}

export const useOpenRouterRankings = qOpenRouter.use;
export const useSuspenseOpenRouterRankings = qOpenRouter.useSuspense;

export const useSuspenseOpenSourceModels = suspenseList<OpenSourceModelEntry>(qOpenSourceModelsRaw, "openSourceModels");

export const useSuspenseOpenSourceReleases = suspenseList<OpenSourceModelEntry>(
  qOpenSourceReleasesRaw,
  "openSourceReleases",
);

function qOpenSourceModel(id: string) {
  return createApiQuery<SourcePayload<OpenSourceModelEntry | null>>(
    queryKeys.openSourceModel(id),
    apiPaths.openSourceModel(id),
    { ttl: SLOW_TTL_MS },
  );
}

export function useSuspenseOpenSourceModel(id: string): OpenSourceModelEntry | null {
  const { data } = qOpenSourceModel(id).useSuspense();
  if (data == null || typeof data !== "object" || !("data" in data)) return null;
  return (data as SourcePayload<OpenSourceModelEntry | null>).data ?? null;
}

export const useSuspenseClosedReleases = suspenseList<ClosedReleaseEntry>(qClosedReleasesRaw, "closedReleases");

export const useSuspenseClosedReleasesState = suspenseListState<ClosedReleaseEntry>(
  qClosedReleasesRaw,
  "closedReleases",
);

export const useSuspenseNewsState = (category: NewsCategory): { items: NewsItem[]; partial: boolean } =>
  suspenseListState<NewsItem>(qNewsRaw(category), `news:${category}`)();

export const useSuspenseStatusHistory = qStatusHistory.useSuspense;
export const useSuspenseAgentRankings = qAgent.useSuspense;

interface OpenSourceModelsQuery {
  data: OpenSourceModelEntry[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

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

interface Prefetchable {
  prefetch: (qc: QueryClient) => Promise<void>;
}

/** Prefetches every listed query in order; the calls are fire-and-forget. */
function prefetchAll(qc: QueryClient, ...queries: Prefetchable[]): void {
  for (const q of queries) void q.prefetch(qc);
}

interface RoutePrefetchEntry {
  match: (path: string) => boolean;
  run: (qc: QueryClient) => void;
}

const ROUTE_PREFETCH_MAP: RoutePrefetchEntry[] = [
  {
    match: (p) => p === "/",
    run: (qc) =>
      prefetchAll(qc, qArtificialRaw, qHomeDashboardRaw, qClosedReleasesRaw, qOpenSourceReleasesRaw, qStatusHistory),
  },
  {
    match: (p) => p === "/models",
    run: (qc) => prefetchAll(qc, qArtificialRaw, qOpenRouter, qOpenSourceModelsRaw, qAgent, qOfficialPricing),
  },
  {
    match: (p) => p === "/releases",
    run: (qc) => prefetchAll(qc, qOpenSourceReleasesRaw, qClosedReleasesRaw),
  },
  {
    match: (p) => p === "/news",
    run: (qc) => prefetchAll(qc, ...NEWS_CATEGORIES.map((c) => qNewsRaw(c))),
  },
  {
    match: (p) => p === "/status" || p.startsWith("/status/"),
    run: (qc) => prefetchAll(qc, qStatusHistory),
  },
  {
    match: (p) => p === "/price-compare" || p === "/compare",
    run: (qc) => prefetchAll(qc, qArtificialRaw, qOfficialPricing),
  },
  {
    match: (p) => p.startsWith("/model/"),
    run: (qc) => prefetchAll(qc, qArtificialRaw, qOpenRouter, qOfficialPricing),
  },
];

export const prefetchQueriesForRoute = (qc: QueryClient, pathname: string): void => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  ROUTE_PREFETCH_MAP.find((entry) => entry.match(path))?.run(qc);
};

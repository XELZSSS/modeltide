import { useQuery, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
  THIRTY_MINUTES,
  apiPaths,
} from "@/shared/config";
import type { ApiDomain, PayloadOf } from "@/contract/api-contract";
import { fetcher } from "@/client/api/api-client";
import { buildHallucinationRankings } from "@/client/utils/hallucination";
import { queryKeys } from "@/shared/config";
import type {
  AgentRankEntry,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  NewsCategory,
  NewsItem,
  OpenSourceModelEntry,
  SourcePayload,
} from "@/shared/types";
import { dedupeBy, isPartialDashboard } from "@/shared/utils";
import {
  isPartialPayload,
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
  unwrapObject,
} from "@/client/api/payload-normalize";

interface ApiQueryOptions<T> {
  ttl?: number;
  gcTime?: number;
  partialRefetchMs?: number;
  refetchMs?: number;
  isPartialData?: (data: SourcePayload<T> | undefined) => boolean;
}

const MAX_PARTIAL_POLLS = 5;

const partialPollBases = new WeakMap<object, number>();

function partialPollInterval<T>(
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

function createApiQuery<D extends ApiDomain>(
  domain: D,
  key: readonly (string | number)[],
  opts?: ApiQueryOptions<PayloadOf<D>> & { query?: Record<string, string> },
) {
  const { ttl, gcTime, partialRefetchMs, refetchMs, isPartialData, query } = opts ?? {};
  const queryFn = fetcher<PayloadOf<D>>(query ? `${apiPaths[domain]}?${new URLSearchParams(query)}` : apiPaths[domain]);
  const ttlMs = ttl ?? THIRTY_MINUTES;
  const partialPoll: false | ((query: unknown) => number | false) =
    partialRefetchMs != null && isPartialData != null
      ? (query: unknown) => partialPollInterval<SourcePayload<PayloadOf<D>>>(query, isPartialData, partialRefetchMs)
      : false;
  const refetchInterval: number | false | ((query: unknown) => number | false) =
    partialPoll === false ? (refetchMs ?? false) : partialPoll;
  const timing = {
    gcTime: gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
    refetchInterval,
    staleTime: ttlMs,
  };
  return {
    domain,
    use: (enabled = true) => useQuery<SourcePayload<PayloadOf<D>>>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<SourcePayload<PayloadOf<D>>>({ queryKey: key, queryFn, ...timing }),
    prefetch: (qc: QueryClient) =>
      qc.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}

interface SuspenseQueryLike {
  useSuspense: () => { data: unknown };
}

function suspenseList<T>(q: SuspenseQueryLike, label: string): () => T[] {
  return () => unwrapList<T>(q.useSuspense().data, label);
}

function suspenseListState<T>(
  q: SuspenseQueryLike,
  label: string,
): () => { items: T[]; partial: boolean; malformed: boolean } {
  return () => {
    const { data, partial, malformed } = unwrapListPartial<T>(q.useSuspense().data, label);
    return { items: data, partial, malformed };
  };
}

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
  isPartialData: (d) => d != null && isPartialDashboard(d.data),
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

export function qNewsRaw(c: NewsCategory) {
  const category = (NEWS_CATEGORIES.includes(c) ? c : NEWS_CATEGORIES[0]) as NewsCategory;
  return createApiQuery("news", queryKeys.news(category), {
    ttl: NEWS_TTL_MS,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
    query: { category },
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

export function useArtificialRankings(enabled = true) {
  const q = qArtificialRaw.use(enabled);
  const unwrapped = useUnwrappedPartial<ArtificialAnalysisModel>(q.data, "artificialIndex");
  const hasData = unwrapped.data.length > 0;
  const isError = enabled && !hasData && !q.isPending && (q.isError || unwrapped.malformed);
  const error = isError ? (q.error ?? new Error("Malformed artificialIndex payload")) : null;
  return { ...q, data: unwrapped.data, isError, error };
}

export const useSuspenseArtificialRankings = suspenseList<ArtificialAnalysisModel>(qArtificialRaw, "artificialIndex");

export const useSuspenseArtificialRankingsState = suspenseListState<ArtificialAnalysisModel>(
  qArtificialRaw,
  "artificialIndex",
);

export function useSuspenseHomeDashboard() {
  const { data } = qHomeDashboardRaw.useSuspense();
  return useMemo(() => normalizeHomeDashboard(data), [data]);
}

export const useOpenRouterRankings = qOpenRouter.use;
export const useSuspenseOpenRouterRankings = qOpenRouter.useSuspense;

export const useSuspenseOpenSourceModelsState = suspenseListState<OpenSourceModelEntry>(
  qOpenSourceModelsRaw,
  "openSourceModels",
);

function qOpenSourceModel(id: string) {
  return createApiQuery("openSourceModel", queryKeys.openSourceModel(id), {
    ttl: ONE_MINUTE,
    query: { id },
  });
}

export function useSuspenseOpenSourceModel(id: string): OpenSourceModelEntry | null {
  const { data } = qOpenSourceModel(id).useSuspense();
  return unwrapObject<OpenSourceModelEntry | null>(data, "openSourceModel") ?? null;
}

export const useSuspenseClosedReleasesState = suspenseListState<ClosedReleaseEntry>(
  qClosedReleasesRaw,
  "closedReleases",
);

export const useSuspenseNewsState = (
  category: NewsCategory,
): { items: NewsItem[]; partial: boolean; malformed: boolean } =>
  suspenseListState<NewsItem>(qNewsRaw(category), `news:${category}`)();

export const useSuspenseStatusHistory = qStatusHistory.useSuspense;
export const useSuspenseAgentRankingsState = suspenseListState<AgentRankEntry>(qAgent, "agentRankings");

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

  const trendingUnwrapped = useUnwrappedPartial<OpenSourceModelEntry>(trending.data, "openSourceModels");
  const trendingList = trendingUnwrapped.data;

  const data = useMemo(
    () =>
      dedupeBy(
        trendingList.filter((m) => m.id),
        (m) => m.id,
      ),
    [trendingList],
  );

  const hasData = data.length > 0;
  const malformed = trendingUnwrapped.malformed;
  const isPending = enabled && !hasData && !malformed && trending.isPending;
  const isError = enabled && !hasData && (trending.isError || (malformed && !trending.isPending));
  const error = isError ? (trending.error ?? new Error("Malformed open-source payload")) : null;

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

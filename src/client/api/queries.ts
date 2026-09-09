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
import { fetcher, type QueryCtx } from "@/client/api/client";
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
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  queryFn?: (ctx: QueryCtx) => Promise<T>;
  /**
   * When the served data is partial (degraded upstream), poll on this
   * interval instead of sitting on the full staleTime. Matches the
   * shortened server TTLs for partial payloads (see shared/config/time).
   */
  partialRefetchMs?: number;
  isPartialData?: (data: T | undefined) => boolean;
}

function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { queryFn: customFn, ttl, partialRefetchMs, isPartialData, ...rest } = opts ?? {};
  const queryFn = customFn ?? fetcher<T>(path);
  const ttlMs = ttl ?? rest.staleTime ?? THIRTY_MINUTES;
  const partialPoll: false | ((query: unknown) => number | false) =
    partialRefetchMs != null && isPartialData != null
      ? // (query: unknown): keeps T inference for useQuery intact, and matches
        // the v5 signature which passes the Query (data lives at state.data).
        (query: unknown) => {
          const data = (query as { state?: { data?: T } } | null)?.state?.data;
          return isPartialData(data) ? partialRefetchMs : false;
        }
      : false;
  const timing = {
    gcTime: rest.gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
    refetchInterval: partialPoll,
    ...rest,
    staleTime: rest.staleTime ?? ttlMs,
  };
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...timing }),
    /** Warm the cache ahead of navigation; no-op while data is still fresh. */
    prefetch: (qc: QueryClient) =>
      qc.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}

const qArtificialRaw = createApiQuery<SourcePayload<ArtificialAnalysisModel[]>>(
  queryKeys.artificialIndex,
  apiPaths.artificialIndex,
  {
    ttl: THIRTY_MINUTES,
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
  { ttl: THIRTY_MINUTES },
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

function resolveNewsCategory(c: NewsCategory): NewsCategory {
  return (NEWS_CATEGORIES.includes(c) ? c : NEWS_CATEGORIES[0]) as NewsCategory;
}

function getCachedQuery<K extends string, Q>(cache: Map<K, Q>, key: K, create: () => Q): Q {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = create();
  cache.set(key, created);
  return created;
}

function safeUnwrapList<T>(payload: unknown, label: string): T[] {
  if (payload == null) return [] as T[];
  try {
    return unwrapList<T>(payload, label);
  } catch (err) {
    console.warn(`[api] dropping malformed ${label} payload:`, err);
    return [] as T[];
  }
}

const newsQueryCache = new Map<string, ReturnType<typeof createApiQuery<SourcePayload<NewsItem[]>>>>();
const openSourceModelQueryCache = new Map<
  string,
  ReturnType<typeof createApiQuery<SourcePayload<OpenSourceModelEntry | null>>>
>();

const qNewsRaw = (c: NewsCategory) => {
  const safe = resolveNewsCategory(c);
  return getCachedQuery(newsQueryCache, safe, () =>
    createApiQuery<SourcePayload<NewsItem[]>>(queryKeys.news(safe), apiPaths.news(safe), {
      ttl: THIRTY_MINUTES,
      partialRefetchMs: PARTIAL_FAIL_TTL_MS,
      isPartialData: (d) => d?.partial === true,
    }),
  );
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
  const data = useMemo(() => safeUnwrapList<ArtificialAnalysisModel>(q.data, "artificialIndex"), [q.data]);
  return { ...q, data };
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
  getCachedQuery(openSourceModelQueryCache, id, () =>
    createApiQuery<SourcePayload<OpenSourceModelEntry | null>>(
      queryKeys.openSourceModel(id),
      apiPaths.openSourceModel(id),
      { ttl: SLOW_TTL_MS },
    ),
  );

/** Single-model lookup without any list window; missing rows resolve to null. */
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

  const trendingList = useMemo(
    () => safeUnwrapList<OpenSourceModelEntry>(trending.data, "openSourceModels"),
    [trending.data],
  );
  const releasesList = useMemo(
    () => safeUnwrapList<OpenSourceModelEntry>(releases.data, "openSourceReleases"),
    [releases.data],
  );

  const data = useMemo(
    () =>
      dedupeBy(
        [...trendingList, ...releasesList].filter((m) => m.id),
        (m) => m.id,
      ),
    [trendingList, releasesList],
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

export function useHallucinationRankings(data: ArtificialAnalysisModel[], enabled = true): HallucinationRankingEntry[] {
  return useMemo(() => (enabled && data.length > 0 ? buildHallucinationRankings(data) : []), [data, enabled]);
}

export function useSuspenseHallucinationRankings(): HallucinationRankingEntry[] {
  const models = useSuspenseArtificialRankings();
  return useHallucinationRankings(models);
}

// ── Navigation prefetch: route → queries to warm on hover/focus ──
// Mirrors ssrJobs-style route declarations, but client-side. Hover prefetch
// hides the API round-trip that replaced SSR hydration; staleTime reuse keeps
// warmed entries fresh for the same window the page would consider fresh.

export const prefetchQueriesForRoute = (qc: QueryClient, pathname: string): void => {
  if (pathname === "/") {
    void qArtificialRaw.prefetch(qc);
    void qHomeDashboardRaw.prefetch(qc);
    void qClosedReleasesRaw.prefetch(qc);
    void qStatusHistory.prefetch(qc);
  } else if (pathname === "/models") {
    void qArtificialRaw.prefetch(qc);
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
  // /news, /model/* and /status/* fetch per-parameter data; the target page
  // fetches on mount (same cost as the old SSR-less fallback).
};

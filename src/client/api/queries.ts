import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  API_DOMAINS,
  ARENA_BOARD_IDS,
  FIVE_MINUTES,
  NEWS_CATEGORIES,
  OPEN_SOURCE_MODELS_DEFAULTS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  THIRTY_MINUTES,
  clientApiPaths as apiPaths,
} from "@/shared/config";
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

const FETCH_TIMEOUT_MS = 60_000;

const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/+$/, "") ?? "";

interface QueryCtx {
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

function timeoutSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.timeout === "function") return { signal: AbortSignal.timeout(ms), cleanup: () => {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cleanup: () => clearTimeout(timer) };
}

function combineSignals(a: AbortSignal, b: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.any === "function") return { signal: AbortSignal.any([a, b]), cleanup: () => {} };
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    cleanup: () => {
      a.removeEventListener("abort", onAbort);
      b.removeEventListener("abort", onAbort);
    },
  };
}

async function parseErrorMessage(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  let message = `HTTP ${res.status}: ${res.statusText}`;
  try {
    if (ct.includes("application/json")) {
      const body = (await res.json()) as { error?: { message?: string } } | null;
      if (body?.error?.message) message = body.error.message;
    } else {
      const text = await res.text();
      if (text) message = text.slice(0, 500);
    }
  } catch (e) {
    console.warn("[api] failed to parse error response:", e);
  }
  return message;
}

async function apiFetch<T>(path: string, signal?: AbortSignal, opts?: { cache?: RequestCache }): Promise<T> {
  const url = apiBase && path.startsWith("/") ? apiBase + path : path;
  const timeout = timeoutSignal(FETCH_TIMEOUT_MS);
  const combined = signal ? combineSignals(signal, timeout.signal) : null;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: combined ? combined.signal : timeout.signal,
      cache: opts?.cache,
    });
    if (!res.ok) throw new ApiClientError(await parseErrorMessage(res), res.status);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new ApiClientError(`Expected JSON but got ${ct || "unknown content-type"}`, res.status);
    }
    return ((await res.json()) as { data: T }).data;
  } finally {
    combined?.cleanup();
    timeout.cleanup();
  }
}

const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);

const queryKeys = {
  artificialIndex: ["api", API_DOMAINS.artificialIndex] as const,
  openSourceReleases: ["api", API_DOMAINS.openSourceReleases] as const,
  openRouterRankings: ["api", API_DOMAINS.openRouterRankings] as const,
  homeDashboard: ["api", API_DOMAINS.homeDashboard] as const,
  openSourceModels: [
    "api",
    API_DOMAINS.openSourceModels,
    OPEN_SOURCE_MODELS_DEFAULTS.sort,
    OPEN_SOURCE_MODELS_DEFAULTS.direction,
    OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ] as const,
  statusHistory: ["api", API_DOMAINS.statusHistory] as const,
  news: (category: string) => ["api", API_DOMAINS.news, category] as const,
  arenaBoard: (category: string) => ["api", API_DOMAINS.arenaBoard, category] as const,
  arenaRankings: ["api", API_DOMAINS.arenaRankings] as const,
  officialPricing: ["api", API_DOMAINS.officialPricing] as const,
  closedReleases: ["api", API_DOMAINS.closedReleases] as const,
};

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

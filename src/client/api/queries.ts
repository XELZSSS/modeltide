import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  API_DOMAINS,
  FIVE_MINUTES,
  OPEN_SOURCE_MODELS_DEFAULTS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  THIRTY_MINUTES,
  apiPaths as baseApiPaths,
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
import { normalizePercent, dedupeBy } from "@/client/utils";

// ---- fetch infra ----
// Client timeout stays above the server's ~25s route timeout so the server's
// 504 surfaces first instead of masking as a network error.
const FETCH_TIMEOUT_MS = 60_000;

// Strip trailing slashes so apiBase concatenates safely with "/api/..." paths.
const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/+$/, "") ?? "";

export interface QueryCtx {
  signal?: AbortSignal;
}

/** API error carrying the HTTP status (404 → NotFound, 5xx → retry). */
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

/** GET `path` and unwrap the server's `{ data }` envelope. */
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

// Client path builders from the shared apiPaths map.
// A separate VITE_API_BASE origin also needs a connect-src entry in public/_headers.
export const apiPaths = {
  artificialIndex: baseApiPaths.artificialIndex,
  openSourceModels: (() => {
    const d = OPEN_SOURCE_MODELS_DEFAULTS;
    return `${baseApiPaths.openSourceModels}?sort=${d.sort}&direction=${d.direction}&limit=${d.limit}`;
  })(),
  openSourceReleases: baseApiPaths.openSourceReleases,
  openRouterRankings: baseApiPaths.openRouterRankings,
  closedReleases: baseApiPaths.closedReleases,
  arenaBoard: (category: string) => `${baseApiPaths.arenaBoard}?category=${encodeURIComponent(category)}`,
  arenaRankings: baseApiPaths.arenaRankings,
  officialPricing: baseApiPaths.officialPricing,
  statusHistory: baseApiPaths.statusHistory,
  news: (category: string) => `${baseApiPaths.news}?category=${encodeURIComponent(category)}`,
  homeDashboard: baseApiPaths.homeDashboard,
} as const;

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);

// Query keys derive from the shared API domain suffixes, matching the
// server KV cache keys so client/server naming can't drift.
export const queryKeys = {
  artificialIndex: ["api", API_DOMAINS.artificialIndex] as const,
  openSourceReleases: ["api", API_DOMAINS.openSourceReleases] as const,
  openRouterRankings: ["api", API_DOMAINS.openRouterRankings] as const,
  homeDashboard: ["api", API_DOMAINS.homeDashboard] as const,
  // The client always requests the shared defaults; the key mirrors the URL builder.
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
  /** Refetch cadence; also used as staleTime. */
  ttl?: number;
  staleTime?: number;
  refetchInterval?: number | false;
  queryFn?: (ctx: QueryCtx) => Promise<T>;
}

/** Typed query for `path` with `key`, exposing `use` and `useSuspense`. */
function createApiQuery<T>(key: readonly (string | number)[], path: string, opts?: ApiQueryOptions<T>) {
  const { queryFn: customFn, ttl, ...rest } = opts ?? {};
  const queryFn = customFn ?? fetcher<T>(path);
  // No background polling by default; pass refetchInterval explicitly for live data.
  const timing = { staleTime: ttl, refetchInterval: false as const, ...rest };
  return {
    use: (enabled = true) => useQuery<T>({ queryKey: key, queryFn, ...timing, enabled }),
    useSuspense: () => useSuspenseQuery<T>({ queryKey: key, queryFn, ...timing }),
  };
}

export const qArtificial = createApiQuery<ArtificialAnalysisModel[]>(
  queryKeys.artificialIndex,
  apiPaths.artificialIndex,
  { ttl: THIRTY_MINUTES },
);
export const qOpenSourceReleases = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceReleases,
  apiPaths.openSourceReleases,
  { ttl: SLOW_TTL_MS },
);
export const qOpenRouter = createApiQuery<OpenRouterRankingsPayload>(
  queryKeys.openRouterRankings,
  apiPaths.openRouterRankings,
  { ttl: THIRTY_MINUTES },
);
export const qHomeDashboard = createApiQuery<HomeDashboardData>(queryKeys.homeDashboard, apiPaths.homeDashboard, {
  ttl: THIRTY_MINUTES,
});
export const qOpenSourceModels = createApiQuery<OpenSourceModelEntry[]>(
  queryKeys.openSourceModels,
  apiPaths.openSourceModels,
  { ttl: SLOW_TTL_MS },
);

// One stable query per category (module-level cache).
const newsQueries = new Map<NewsCategory, ReturnType<typeof createApiQuery<NewsItem[]>>>();
export const qNews = (c: NewsCategory) => {
  let q = newsQueries.get(c);
  if (!q) {
    q = createApiQuery<NewsItem[]>(queryKeys.news(c), apiPaths.news(c), { ttl: THIRTY_MINUTES });
    newsQueries.set(c, q);
  }
  return q;
};

// Status store updates on cron; light polling here, mount-refetch elsewhere.
export const qStatusHistory = createApiQuery<StatusHistoryPayload>(queryKeys.statusHistory, apiPaths.statusHistory, {
  ttl: FIVE_MINUTES,
  refetchInterval: FIVE_MINUTES,
});
export const qArena = createApiQuery<ArenaRankingsPayload>(queryKeys.arenaRankings, apiPaths.arenaRankings, {
  ttl: SLOW_TTL_MS,
});
export const qOfficialPricing = createApiQuery<OfficialPricingPayload>(
  queryKeys.officialPricing,
  apiPaths.officialPricing,
  { ttl: STATIC_TTL_MS },
);
export const qClosedReleases = createApiQuery<ClosedReleaseEntry[]>(queryKeys.closedReleases, apiPaths.closedReleases, {
  ttl: STATIC_TTL_MS,
});

// One stable query per board (module-level cache).
const boardQueries = new Map<string, ReturnType<typeof createApiQuery<ArenaBoardPayload>>>();
export const qArenaBoard = (category: string) => {
  let q = boardQueries.get(category);
  if (!q) {
    q = createApiQuery<ArenaBoardPayload>(queryKeys.arenaBoard(category), apiPaths.arenaBoard(category), {
      ttl: SLOW_TTL_MS,
    });
    boardQueries.set(category, q);
  }
  return q;
};
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

/** Merge trending + release lists, deduped by id. Supports partial data. */
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
  // Only surface an error when there's nothing to show; otherwise callers
  // rendering partial data would misinterpret error != null as failure.
  const error = isError ? (trending.error ?? releases.error ?? null) : null;

  return {
    data,
    isPending,
    isError,
    error,
  };
}

// One entry per model with an omniscience breakdown, sorted by accuracy desc.
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

/** Memoized hallucination rankings. */
export function useHallucinationRankings(data: ArtificialAnalysisModel[], enabled = true): HallucinationRankingEntry[] {
  return useMemo(() => (enabled && data.length > 0 ? buildHallucinationRankings(data) : []), [data, enabled]);
}

/** Suspense wrapper combining AA rankings with derived hallucination rankings. */
export function useSuspenseHallucinationRankings(): HallucinationRankingEntry[] {
  const { data } = useSuspenseArtificialRankings();
  return useHallucinationRankings(data);
}

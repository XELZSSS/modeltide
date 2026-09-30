import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery, type QueryClient, type UseQueryReturnType } from "@tanstack/vue-query";
import type { Query } from "@tanstack/query-core";
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
  queryKeys,
} from "@/shared/config";
import type { ApiDomain, PayloadOf } from "@/contract/api-contract";
import { fetcher } from "@/client/api/api-client";
import { buildHallucinationRankings } from "@/client/utils/hallucination";
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
import { dedupeBy } from "@/shared/utils";
import { EMPTY_ARRAY } from "@/client/utils/empty";
import {
  isPartialPayload,
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
  unwrapObject,
  type NormalizedHomeDashboard,
} from "@/client/api/payload-normalize";

type RawPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
type QueryResult<D extends ApiDomain> = UseQueryReturnType<RawPayload<D>, Error>;
type PollFn<D extends ApiDomain> = (
  query: Query<RawPayload<D>, Error, RawPayload<D>, readonly unknown[]>,
) => number | false;

interface ListState<T> {
  items: T[];
  partial: boolean;
  malformed: boolean;
}

interface SuspenseQueryLike {
  suspense: () => Promise<unknown>;
  data: { value: unknown };
}

const MAX_PARTIAL_POLLS = 5;

const partialPollCounts = new Map<string, number>();

interface PollQuery {
  queryKey?: readonly unknown[];
  state?: { data?: unknown; dataUpdateCount?: number; errorUpdateCount?: number };
}

function partialPollInterval(
  query: unknown,
  isPartialData: (data: unknown) => boolean,
  partialRefetchMs: number,
): number | false {
  if (query == null || typeof query !== "object") return false;
  const pollQuery = query as PollQuery;
  const pollKey = JSON.stringify(pollQuery.queryKey ?? null);
  const state = pollQuery.state;
  if (!isPartialData(state?.data)) {
    partialPollCounts.delete(pollKey);
    return false;
  }
  const settled = (state?.dataUpdateCount ?? 0) + (state?.errorUpdateCount ?? 0);
  const base = partialPollCounts.get(pollKey) ?? settled;
  partialPollCounts.set(pollKey, base);
  return settled - base >= MAX_PARTIAL_POLLS ? false : partialRefetchMs;
}

interface ApiQueryOptions<T> {
  ttl?: number;
  gcTime?: number;
  partialRefetchMs?: number;
  refetchMs?: number;
  isPartialData?: (data: SourcePayload<T> | undefined) => boolean;
  query?: Record<string, string>;
}

function createApiQuery<D extends ApiDomain>(domain: D, key: readonly (string | number)[], opts?: ApiQueryOptions<PayloadOf<D>>) {
  const { ttl, gcTime, partialRefetchMs, refetchMs, isPartialData, query } = opts ?? {};
  const path = query ? `${apiPaths[domain]}?${new URLSearchParams(query)}` : apiPaths[domain];
  const queryFn = fetcher<PayloadOf<D>>(path);
  const ttlMs = ttl ?? THIRTY_MINUTES;
  const refetchInterval: number | false | PollFn<D> =
    isPartialData != null && partialRefetchMs != null
      ? (query) => partialPollInterval(query, isPartialData as (data: unknown) => boolean, partialRefetchMs)
      : (refetchMs ?? false);
  const timing = {
    gcTime: gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
    refetchInterval,
    staleTime: ttlMs,
  };
  const use = (enabled?: MaybeRefOrGetter<boolean>): UseQueryReturnType<RawPayload<D>, Error> =>
    useQuery<RawPayload<D>, Error>({ queryKey: key, queryFn, ...timing, enabled });
  return {
    domain,
    key,
    queryFn,
    use,
    prefetch: (client: QueryClient) =>
      client.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}

async function suspenseState<T>(query: SuspenseQueryLike, label: string): Promise<ComputedRef<ListState<T>>> {
  await query.suspense();
  return computed(() => {
    const { data, partial, malformed } = unwrapListPartial<T>(query.data.value, label);
    return { items: data, partial, malformed };
  });
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

export function qNewsRaw(category: NewsCategory) {
  const resolved = (NEWS_CATEGORIES.includes(category) ? category : NEWS_CATEGORIES[0]) as NewsCategory;
  return createApiQuery("news", queryKeys.news(resolved), {
    ttl: NEWS_TTL_MS,
    partialRefetchMs: PARTIAL_FAIL_TTL_MS,
    isPartialData: isPartialPayload,
    query: { category: resolved },
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

export function useArtificialRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qArtificialRaw.use(enabled);
  const unwrapped = computed(() => unwrapListPartial<ArtificialAnalysisModel>(query.data.value, "artificialIndex"));
  const data = computed(() => unwrapped.value.data);
  const isError = computed(
    () => toValue(enabled) && data.value.length === 0 && !query.isPending.value && (query.isError.value || unwrapped.value.malformed),
  );
  const error = computed(() =>
    isError.value ? (query.error.value ?? new Error("Malformed artificialIndex payload")) : null,
  );
  return { ...query, data, isError, error };
}

export async function useSuspenseArtificialRankings(): Promise<ComputedRef<ArtificialAnalysisModel[]>> {
  const query = qArtificialRaw.use();
  await query.suspense();
  return computed(() => unwrapList<ArtificialAnalysisModel>(query.data.value, "artificialIndex"));
}

export const useSuspenseArtificialRankingsState = () =>
  suspenseState<ArtificialAnalysisModel>(qArtificialRaw.use(), "artificialIndex");

export async function useSuspenseHomeDashboard(): Promise<ComputedRef<NormalizedHomeDashboard>> {
  const query = qHomeDashboardRaw.use();
  await query.suspense();
  return computed(() => normalizeHomeDashboard(query.data.value));
}

export const useOpenRouterRankings = qOpenRouter.use;

export async function useSuspenseOpenRouterRankings(): Promise<QueryResult<"openRouterRankings">> {
  const query = qOpenRouter.use();
  await query.suspense();
  return query;
}

export const useSuspenseOpenSourceModelsState = () =>
  suspenseState<OpenSourceModelEntry>(qOpenSourceModelsRaw.use(), "openSourceModels");

type OpenSourceModelQuery = ReturnType<typeof createApiQuery<"openSourceModel">>;

const openSourceModelQueries = new Map<string, OpenSourceModelQuery>();

function qOpenSourceModel(id: string): OpenSourceModelQuery {
  const existing = openSourceModelQueries.get(id);
  if (existing) return existing;
  const created = createApiQuery("openSourceModel", queryKeys.openSourceModel(id), {
    ttl: ONE_MINUTE,
    query: { id },
  });
  openSourceModelQueries.set(id, created);
  return created;
}

export async function useSuspenseOpenSourceModel(id: string): Promise<ComputedRef<OpenSourceModelEntry | null>> {
  const query = qOpenSourceModel(id).use();
  await query.suspense();
  return computed(() => unwrapObject<OpenSourceModelEntry | null>(query.data.value, "openSourceModel") ?? null);
}

export const useSuspenseClosedReleasesState = () =>
  suspenseState<ClosedReleaseEntry>(qClosedReleasesRaw.use(), "closedReleases");

export const useSuspenseNewsState = (category: NewsCategory) =>
  suspenseState<NewsItem>(qNewsRaw(category).use(), `news:${category}`);

export async function useSuspenseStatusHistory(): Promise<QueryResult<"statusHistory">> {
  const query = qStatusHistory.use();
  await query.suspense();
  return query;
}

export const useSuspenseAgentRankingsState = () =>
  suspenseState<AgentRankEntry>(qAgent.use(), "agentRankings");

export function useAllOpenSourceModels(enabled: MaybeRefOrGetter<boolean> = true): {
  data: ComputedRef<OpenSourceModelEntry[]>;
  isPending: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
} {
  const trending = qOpenSourceModelsRaw.use(enabled);
  const unwrapped = computed(() => unwrapListPartial<OpenSourceModelEntry>(trending.data.value, "openSourceModels"));
  const data = computed(() =>
    dedupeBy(
      unwrapped.value.data.filter((model) => model.id),
      (model) => model.id,
    ),
  );
  const isPending = computed(
    () => toValue(enabled) && data.value.length === 0 && !unwrapped.value.malformed && trending.isPending.value,
  );
  const isError = computed(
    () =>
      toValue(enabled) &&
      data.value.length === 0 &&
      (trending.isError.value || (unwrapped.value.malformed && !trending.isPending.value)),
  );
  const error = computed(() => (isError.value ? (trending.error.value ?? new Error("Malformed open-source payload")) : null));
  return { data, isPending, isError, error };
}

export function useHallucinationRankings(
  data: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  enabled: MaybeRefOrGetter<boolean> = true,
): ComputedRef<HallucinationRankingEntry[]> {
  return computed(() => {
    const models = toValue(data);
    return toValue(enabled) && models.length > 0 ? buildHallucinationRankings(models) : (EMPTY_ARRAY as HallucinationRankingEntry[]);
  });
}

export async function useSuspenseHallucinationRankings(): Promise<ComputedRef<HallucinationRankingEntry[]>> {
  const models = await useSuspenseArtificialRankings();
  return useHallucinationRankings(models);
}

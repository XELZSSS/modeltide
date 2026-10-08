import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type {
  AgentRankEntry,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  NewsCategory,
  NewsItem,
  OpenSourceModelEntry,
} from "@/shared/types";
import { dedupeBy } from "@/shared/utils";
import { buildHallucinationRankings } from "@/shared/utils/hallucination";
import { emptyArray } from "@/client/utils/empty";
import {
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
  unwrapObject,
  type NormalizedHomeDashboard,
} from "@/client/api/payload-normalize";
import {
  qAgent,
  qArtificialRaw,
  qClosedReleasesRaw,
  qHomeDashboardRaw,
  qNewsRaw,
  qOpenSourceModel,
  qOpenSourceModelsRaw,
  qOpenRouter,
  qStatusHistory,
} from "./catalog";
import type { QueryResult } from "./factory";

interface ListState<T> {
  items: T[];
  partial: boolean;
  malformed: boolean;
}

interface SuspenseQueryLike {
  suspense: () => Promise<unknown>;
  data: { value: unknown };
}

async function suspenseState<T>(query: SuspenseQueryLike, label: string): Promise<ComputedRef<ListState<T>>> {
  await query.suspense();
  return computed(() => {
    const { data, partial, malformed } = unwrapListPartial<T>(query.data.value, label);
    return { items: data, partial, malformed };
  });
}

export function useArtificialRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qArtificialRaw.use(enabled);
  const unwrapped = computed(() => unwrapListPartial<ArtificialAnalysisModel>(query.data.value, "artificialIndex"));
  const data = computed(() => unwrapped.value.data);
  const isError = computed(
    () =>
      toValue(enabled) &&
      data.value.length === 0 &&
      !query.isPending.value &&
      (query.isError.value || unwrapped.value.malformed),
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

export const useSuspenseOpenRouterRankingsState = () =>
  suspenseState<import("@/shared/types").OpenRouterRankEntry>(qOpenRouter.use(), "openRouterRankings");

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

export const useSuspenseAgentRankingsState = () => suspenseState<AgentRankEntry>(qAgent.use(), "agentRankings");

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
  const error = computed(() =>
    isError.value ? (trending.error.value ?? new Error("Malformed open-source payload")) : null,
  );
  return { data, isPending, isError, error };
}

export function useHallucinationRankings(
  data: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  enabled: MaybeRefOrGetter<boolean> = true,
): ComputedRef<HallucinationRankingEntry[]> {
  return computed(() => {
    const models = toValue(data);
    return toValue(enabled) && models.length > 0
      ? buildHallucinationRankings(models)
      : emptyArray<HallucinationRankingEntry>();
  });
}

export async function useSuspenseHallucinationRankings(): Promise<ComputedRef<HallucinationRankingEntry[]>> {
  const models = await useSuspenseArtificialRankings();
  return useHallucinationRankings(models);
}

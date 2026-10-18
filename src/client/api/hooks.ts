import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  NewsCategory,
  NewsItem,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";
import { dedupeBy } from "@/shared/utils";
import { buildHallucinationRankings } from "@/shared/utils/hallucination";
import {
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
  unwrapObject,
  type NormalizedHomeDashboard,
} from "./payload-normalize";
import {
  qArtificialList,
  qClosedReleasesList,
  qHomeDashboard,
  qNewsList,
  qOpenSourceModelById,
  qOpenSourceModelsList,
  qOpenRouterList,
} from "./catalog";

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
  const query = qArtificialList.use(enabled);
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
  const query = qArtificialList.use();
  await query.suspense();
  return computed(() => unwrapList<ArtificialAnalysisModel>(query.data.value, "artificialIndex"));
}

export const useSuspenseArtificialRankingsState = () =>
  suspenseState<ArtificialAnalysisModel>(qArtificialList.use(), "artificialIndex");

export async function useSuspenseHomeDashboard(): Promise<ComputedRef<NormalizedHomeDashboard>> {
  const query = qHomeDashboard.use();
  await query.suspense();
  return computed(() => normalizeHomeDashboard(query.data.value));
}

export const useOpenRouterRankings = qOpenRouterList.use;

/** Resolved list state plus the server's real fetch time, for copy that ages the data. */
export interface OpenRouterRankingsState {
  readonly items: ComputedRef<OpenRouterRankEntry[]>;
  readonly partial: ComputedRef<boolean>;
  readonly malformed: ComputedRef<boolean>;
  readonly fetchedAt: ComputedRef<string | undefined>;
}

export async function useSuspenseOpenRouterRankings(): Promise<OpenRouterRankingsState> {
  const query = qOpenRouterList.use();
  await query.suspense();
  // One unwrap feeds both the list state and fetchedAt, so the payload is decoded once per change.
  const unwrapped = computed(() => unwrapListPartial<OpenRouterRankEntry>(query.data.value, "openRouterRankings"));
  const fetchedAt = computed(() => (query.data.value as { fetchedAt?: unknown } | null)?.fetchedAt);
  return {
    items: computed(() => unwrapped.value.data),
    partial: computed(() => unwrapped.value.partial),
    malformed: computed(() => unwrapped.value.malformed),
    fetchedAt: computed(() => (typeof fetchedAt.value === "string" ? fetchedAt.value : undefined)),
  };
}

export const useSuspenseOpenSourceModelsState = () =>
  suspenseState<OpenSourceModelEntry>(qOpenSourceModelsList.use(), "openSourceModels");

export async function useSuspenseOpenSourceModel(id: string): Promise<ComputedRef<OpenSourceModelEntry | null>> {
  const query = qOpenSourceModelById(id).use();
  await query.suspense();
  return computed(() => unwrapObject<OpenSourceModelEntry | null>(query.data.value, "openSourceModel") ?? null);
}

export const useSuspenseClosedReleasesState = () =>
  suspenseState<ClosedReleaseEntry>(qClosedReleasesList.use(), "closedReleases");

export const useSuspenseNewsState = (category: NewsCategory) =>
  suspenseState<NewsItem>(qNewsList(category).use(), `news:${category}`);

export function useAllOpenSourceModels(enabled: MaybeRefOrGetter<boolean> = true): {
  data: ComputedRef<OpenSourceModelEntry[]>;
  isPending: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
} {
  const trending = qOpenSourceModelsList.use(enabled);
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
      : ([] as HallucinationRankingEntry[]);
  });
}

export async function useSuspenseHallucinationRankings(): Promise<ComputedRef<HallucinationRankingEntry[]>> {
  const models = await useSuspenseArtificialRankings();
  return useHallucinationRankings(models);
}

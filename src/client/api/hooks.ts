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
import { buildHallucinationRankings } from "@/shared/utils/hallucination";
import {
  normalizeHomeDashboard,
  unwrapList,
  unwrapListPartial,
  type NormalizedHomeDashboard,
} from "./payload-normalize";
import {
  qArtificialList,
  qClosedReleasesList,
  qHomeDashboard,
  qNewsByCategory,
  qOpenSourceModelById,
  qOpenSourceModelsList,
  qOpenRouterList,
} from "./catalog";

interface ListState<T> {
  readonly items: T[];
  readonly partial: boolean;
  readonly malformed: boolean;
  readonly pending: boolean;
  readonly error: Error | null;
}

interface SuspenseQueryLike {
  suspense: () => Promise<unknown>;
  data: { value: unknown };
}

interface ListQueryLike {
  data: { value: unknown };
  isPending: { value: boolean };
  isError: { value: boolean };
  error: { value: Error | null };
}

function suspendedListState<T>(
  decoded: { data: T[]; partial: boolean; malformed: boolean },
  label: string,
): ListState<T> {
  return {
    items: decoded.data,
    partial: decoded.partial,
    malformed: decoded.malformed,
    pending: false,
    error: decoded.malformed ? new Error(`Malformed ${label} payload`) : null,
  };
}

function enabledListState<T>(query: ListQueryLike, label: string, enabled: MaybeRefOrGetter<boolean>): ListState<T> {
  const unwrapped = unwrapListPartial<T>(query.data.value, label);
  const empty = unwrapped.data.length === 0;
  const on = toValue(enabled);
  const pending = on && empty && !unwrapped.malformed && query.isPending.value;
  const failed = on && empty && (query.isError.value || (unwrapped.malformed && !query.isPending.value));
  return {
    items: unwrapped.data,
    partial: unwrapped.partial,
    malformed: unwrapped.malformed,
    pending,
    error: failed ? (query.error.value ?? new Error(`Malformed ${label} payload`)) : null,
  };
}

async function suspenseDecode<T>(query: SuspenseQueryLike, decode: (payload: unknown) => T): Promise<ComputedRef<T>> {
  await query.suspense();
  return computed(() => decode(query.data.value));
}

export function useArtificialRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qArtificialList.use(enabled);
  const state = computed(() => enabledListState<ArtificialAnalysisModel>(query, "artificialIndex", enabled));
  return { query, state };
}

export function useSuspenseArtificialRankings(): Promise<ComputedRef<ArtificialAnalysisModel[]>> {
  return suspenseDecode(qArtificialList.use(), (payload) =>
    unwrapList<ArtificialAnalysisModel>(payload, "artificialIndex"),
  );
}

export const useSuspenseArtificialRankingsState = () =>
  suspenseDecode(qArtificialList.use(), (payload) =>
    suspendedListState<ArtificialAnalysisModel>(
      unwrapListPartial<ArtificialAnalysisModel>(payload, "artificialIndex"),
      "artificialIndex",
    ),
  );

export const useSuspenseHomeDashboard = (): Promise<ComputedRef<NormalizedHomeDashboard>> =>
  suspenseDecode(qHomeDashboard.use(), normalizeHomeDashboard);

/**
 * Non-suspense OpenRouter ranking query. Returns the decoded list state as well, so consumers (the search layer)
 * get the same `partial`/`malformed`/`error` view as every other source instead of unwrapping the raw payload.
 */
export function useOpenRouterRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qOpenRouterList.use(enabled);
  const state = computed(() => enabledListState<OpenRouterRankEntry>(query, "openRouterRankings", enabled));
  return { query, state };
}

export const useSuspenseOpenRouterRankings = () =>
  suspenseDecode(qOpenRouterList.use(), (payload) =>
    suspendedListState<OpenRouterRankEntry>(
      unwrapListPartial<OpenRouterRankEntry>(payload, "openRouterRankings"),
      "openRouterRankings",
    ),
  );

export const useSuspenseOpenSourceModelsState = () =>
  suspenseDecode(qOpenSourceModelsList.use(), (payload) =>
    suspendedListState<OpenSourceModelEntry>(
      unwrapListPartial<OpenSourceModelEntry>(payload, "openSourceModels"),
      "openSourceModels",
    ),
  );

/**
 * Single-model state, decoded like every other source so the detail page can show the same `partial` notice the list
 * views do. `items` holds zero or one entry; `items[0]` is the not-found signal (`getModelById` answers 200 + empty).
 */
export const useSuspenseOpenSourceModelState = (id: string) =>
  suspenseDecode(qOpenSourceModelById(id).use(), (payload) =>
    suspendedListState<OpenSourceModelEntry>(
      unwrapListPartial<OpenSourceModelEntry>(payload, "openSourceModels"),
      "openSourceModels",
    ),
  );

export const useSuspenseClosedReleasesState = () =>
  suspenseDecode(qClosedReleasesList.use(), (payload) =>
    suspendedListState<ClosedReleaseEntry>(
      unwrapListPartial<ClosedReleaseEntry>(payload, "closedReleases"),
      "closedReleases",
    ),
  );

export const useSuspenseNewsState = (category: NewsCategory) =>
  suspenseDecode(qNewsByCategory(category).use(), (payload) =>
    suspendedListState<NewsItem>(unwrapListPartial<NewsItem>(payload, `news:${category}`), `news:${category}`),
  );

export function useAllOpenSourceModels(enabled: MaybeRefOrGetter<boolean> = true): {
  query: ReturnType<typeof qOpenSourceModelsList.use>;
  state: ComputedRef<ListState<OpenSourceModelEntry>>;
} {
  const query = qOpenSourceModelsList.use(enabled);
  const state = computed<ListState<OpenSourceModelEntry>>(() => {
    const current = enabledListState<OpenSourceModelEntry>(query, "openSourceModels", enabled);
    // Server-side parsing already dedupes by id and tables dedupe again through `usePagedData`, so all that is
    // left here is dropping rows that cannot be keyed.
    return { ...current, items: current.items.filter((model) => model.id) };
  });
  return { query, state };
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

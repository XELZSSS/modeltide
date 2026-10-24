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
import { normalizeHomeDashboard, unwrapListPartial, type NormalizedHomeDashboard } from "./payload-normalize";
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

/**
 * The shape every list state hook repeats: decode one query's payload into a `ListState`, using the same label for the
 * payload validator and for the state's error text.
 */
function suspenseListState<T>(query: SuspenseQueryLike, label: string): Promise<ComputedRef<ListState<T>>> {
  return suspenseDecode(query, (payload) => suspendedListState<T>(unwrapListPartial<T>(payload, label), label));
}

export function useArtificialRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qArtificialList.use(enabled);
  const state = computed(() => enabledListState<ArtificialAnalysisModel>(query, "artificialIndex", enabled));
  return { query, state };
}

export const useSuspenseArtificialRankingsState = () =>
  suspenseListState<ArtificialAnalysisModel>(qArtificialList.use(), "artificialIndex");

export const useSuspenseHomeDashboard = (): Promise<ComputedRef<NormalizedHomeDashboard>> =>
  suspenseDecode(qHomeDashboard.use(), normalizeHomeDashboard);

const OPEN_ROUTER_LABEL = "openRouterRankings";

/**
 * Non-suspense OpenRouter ranking query. Returns the decoded list state as well, so consumers (the search layer)
 * get the same `partial`/`malformed`/`error` view as every other source instead of unwrapping the raw payload.
 *
 * The rows arrive as served, retired ones included: whether a retired row may still occupy a rank is the ranking's
 * decision, and the detail view needs the row in order to report it as retired rather than as missing.
 */
export function useOpenRouterRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qOpenRouterList.use(enabled);
  const state = computed(() => enabledListState<OpenRouterRankEntry>(query, OPEN_ROUTER_LABEL, enabled));
  return { query, state };
}

export const useSuspenseOpenRouterRankings = () =>
  suspenseListState<OpenRouterRankEntry>(qOpenRouterList.use(), OPEN_ROUTER_LABEL);

export const useSuspenseOpenSourceModelsState = () =>
  suspenseListState<OpenSourceModelEntry>(qOpenSourceModelsList.use(), "openSourceModels");

/**
 * Single-model state, decoded like every other source so the detail page can show the same `partial` notice the list
 * views do. `items` holds zero or one entry; `items[0]` is the not-found signal (`getModelById` answers 200 + empty).
 */
export const useSuspenseOpenSourceModelState = (id: string) =>
  suspenseListState<OpenSourceModelEntry>(qOpenSourceModelById(id).use(), "openSourceModels");

export const useSuspenseClosedReleasesState = () =>
  suspenseListState<ClosedReleaseEntry>(qClosedReleasesList.use(), "closedReleases");

export const useSuspenseNewsState = (category: NewsCategory) =>
  suspenseListState<NewsItem>(qNewsByCategory(category).use(), `news:${category}`);

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

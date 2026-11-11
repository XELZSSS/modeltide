import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  CodingAgentEntry,
  CursorBenchEntry,
  DecisionIndexEntry,
  HallucinationRankingEntry,
  NewsCategory,
  NewsItem,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";
import { buildHallucinationRankings } from "@/shared/utils/hallucination";
import { normalizeHomeDashboard, unwrapListPartial, type NormalizedHomeDashboard } from "./decode/payload";
import { malformedPayload } from "./transport/error";
import {
  qArtificialList,
  qClosedReleasesList,
  qCodingAgentRankings,
  qCursorBench,
  qDecisionIndex,
  qHomeDashboard,
  qNewsByCategory,
  qOpenSourceModelById,
  qOpenSourceModelsList,
  qOpenRouterList,
} from "./query/catalog";

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
    error: failed ? (query.error.value ?? malformedPayload(`Malformed ${label} payload`)) : null,
  };
}

/** The shape every list state hook repeats: decode one query's payload into a `ListState`, using the same label for the
 * payload validator and for the state's error text, once the route's suspense has resolved. */
async function suspenseListState<T>(query: SuspenseQueryLike, label: string): Promise<ComputedRef<ListState<T>>> {
  await query.suspense();
  return computed(() => {
    const decoded = unwrapListPartial<T>(query.data.value, label);
    return {
      items: decoded.data,
      partial: decoded.partial,
      malformed: decoded.malformed,
      pending: false,
      error: decoded.malformed ? malformedPayload(`Malformed ${label} payload`) : null,
    };
  });
}

export function useArtificialRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qArtificialList.use(enabled);
  const state = computed(() => enabledListState<ArtificialAnalysisModel>(query, "artificialIndex", enabled));
  return { query, state };
}

export const useSuspenseArtificialRankingsState = () =>
  suspenseListState<ArtificialAnalysisModel>(qArtificialList.use(), "artificialIndex");

export interface SuspenseHomeDashboard {
  data: ComputedRef<NormalizedHomeDashboard>;
  /** When the payload last arrived, in `Date.now()` ms: the page header prints it as the data's age. */
  updatedAt: ComputedRef<number>;
}

export const useSuspenseHomeDashboard = async (): Promise<SuspenseHomeDashboard> => {
  const query = qHomeDashboard.use();
  await query.suspense();
  return {
    data: computed(() => normalizeHomeDashboard(query.data.value)),
    updatedAt: computed(() => query.dataUpdatedAt.value),
  };
};

const OPEN_ROUTER_LABEL = "openRouterRankings";

/** Non-suspense OpenRouter ranking query. Returns the decoded list state too, so consumers get the same
 * `partial`/`malformed`/`error` view instead of unwrapping the raw payload.
 * Rows arrive as served, retired ones included: whether a retired row may occupy a rank is the ranking's decision. */
export function useOpenRouterRankings(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qOpenRouterList.use(enabled);
  const state = computed(() => enabledListState<OpenRouterRankEntry>(query, OPEN_ROUTER_LABEL, enabled));
  return { query, state };
}

export const useSuspenseOpenRouterRankings = () =>
  suspenseListState<OpenRouterRankEntry>(qOpenRouterList.use(), OPEN_ROUTER_LABEL);

export const useSuspenseOpenSourceModelsState = () =>
  suspenseListState<OpenSourceModelEntry>(qOpenSourceModelsList.use(), "openSourceModels");

/** Single-model state, decoded like every other source so the detail page can show the same `partial` notice the list
 * views do. `items` holds zero or one entry; `items[0]` is the not-found signal (`getModelById` answers 200 + empty). */
export const useSuspenseOpenSourceModelState = (id: string) =>
  suspenseListState<OpenSourceModelEntry>(qOpenSourceModelById(id).use(), "openSourceModels");

/** Non-suspense Decision Index query: the search layer folds every ranking list in as it loads, so it needs the same
 * `partial`/`malformed`/`error` view without suspending the page that happens to be open. */
export function useDecisionIndex(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qDecisionIndex.use(enabled);
  const state = computed(() => enabledListState<DecisionIndexEntry>(query, "decisionIndex", enabled));
  return { query, state };
}

export const useSuspenseDecisionIndexState = () =>
  suspenseListState<DecisionIndexEntry>(qDecisionIndex.use(), "decisionIndex");

export const useSuspenseClosedReleasesState = () =>
  suspenseListState<ClosedReleaseEntry>(qClosedReleasesList.use(), "closedReleases");

export const useSuspenseNewsState = (category: NewsCategory) =>
  suspenseListState<NewsItem>(qNewsByCategory(category).use(), `news:${category}`);

/** Every open-source row arrives already filtered by the parser (an id the loader could not key never reaches the payload). */
export function useAllOpenSourceModels(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = qOpenSourceModelsList.use(enabled);
  const state = computed(() => enabledListState<OpenSourceModelEntry>(query, "openSourceModels", enabled));
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

export const useSuspenseCursorBenchState = () => suspenseListState<CursorBenchEntry>(qCursorBench.use(), "cursorBench");
export const useSuspenseCodingAgentRankings = () =>
  suspenseListState<CodingAgentEntry>(qCodingAgentRankings.use(), "codingAgentRankings");

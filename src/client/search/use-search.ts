import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useDecisionIndex,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/view-models";
import type { SearchResult } from "@/client/search/types";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { foldSearchStr } from "@/client/search/match";
import { defineSource, collect, detailLink, rankSearchHits, type SourceConfig } from "@/client/search/search-rank";
import { modelId } from "@/shared/utils/models";

export const MIN_QUERY = 2;

interface SearchState {
  results: ComputedRef<SearchResult[]>;
  isPending: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  /** The first source that failed, for naming the failure rather than reporting one shared one. */
  error: ComputedRef<Error | null>;
  partial: ComputedRef<boolean>;
}

export function useSearchAllRankings(
  searchTerm: MaybeRefOrGetter<string>,
  // `defer` is true while the queries should stay idle even with a long enough term (the combobox is closed);
  // naming it after the effect removes the double negative call sites had to write against `suspended`.
  opts?: { defer?: MaybeRefOrGetter<boolean>; warm?: MaybeRefOrGetter<boolean> },
): SearchState {
  const baseEnabled = computed(() => toValue(searchTerm).trim().length >= MIN_QUERY);
  const warmEnabled = computed(() => toValue(opts?.warm) === true && baseEnabled.value);
  const enabled = computed(() => warmEnabled.value || (baseEnabled.value && toValue(opts?.defer) !== true));
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);
  const decisionQ = useDecisionIndex(enabled);

  const artificialData = computed(() => artificialQ.state.value.items);
  const openSourceRankings = computed(() => openSourceQ.state.value.items);
  const openRouter = computed(() => orQ.state.value);
  const decisionIndex = computed(() => decisionQ.state.value.items);
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const sources = {
    aa: computed<SourceConfig>(() =>
      defineSource(artificialData.value, SEARCH_FIELDS.aa, (m) => ({
        id: m.id,
        name: m.name,
        source: "modelRankings",
        score: m.intelligence_index,
        scoreLabel: "intelligenceIndex",
        provider: m.model_creators?.name || null,
        // Same identity order as every other link into a model page (`modelId`): id first, slug as the fallback.
        link: detailLink("modelRankings", modelId(m)),
      })),
    ),
    or: computed<SourceConfig>(() =>
      defineSource(openRouter.value.items, SEARCH_FIELDS.or, (e) => ({
        id: e.id,
        name: e.name,
        source: "openRouterRankings",
        score: null,
        scoreLabel: null,
        provider: e.creator || null,
        link: detailLink("openRouterRankings", e.id),
      })),
    ),
    os: computed<SourceConfig>(() =>
      defineSource(openSourceRankings.value, SEARCH_FIELDS.os, (e) => ({
        id: e.id,
        name: e.id,
        source: "openSourceRankings",
        score: null,
        scoreLabel: null,
        provider: e.author || null,
        link: detailLink("openSourceRankings", e.id),
      })),
    ),
    hall: computed<SourceConfig>(() =>
      defineSource(hallucinationRankings.value, SEARCH_FIELDS.hall, (e) => ({
        id: e.id,
        name: e.model,
        source: "hallucinationRankings",
        score: e.omniscienceIndex,
        scoreLabel: "omniscienceIndex",
        provider: null,
        link: detailLink("hallucinationRankings", modelId(e)),
      })),
    ),
    decision: computed<SourceConfig>(() =>
      defineSource(decisionIndex.value, SEARCH_FIELDS.decision, (c) => ({
        id: c.id,
        name: c.name,
        source: "decisionRankings",
        score: c.index,
        scoreLabel: "decisionIndex",
        provider: c.creator || null,
        link: detailLink("decisionRankings", c.id),
      })),
    ),
  };

  const results = computed(() => {
    const needle = foldSearchStr(toValue(searchTerm));
    if (!enabled.value || !baseEnabled.value || !needle) return [];
    return rankSearchHits([
      ...collect(sources.aa.value, needle),
      ...collect(sources.or.value, needle),
      ...collect(sources.os.value, needle),
      ...collect(sources.hall.value, needle),
      ...collect(sources.decision.value, needle),
    ]);
  });

  // The first source that failed, so the popup can name that failure instead of one shared "search failed": the four
  // lists come from four different upstreams and which one broke is the only actionable part.
  const error = computed(() =>
    enabled.value
      ? (artificialQ.state.value.error ??
        openSourceQ.state.value.error ??
        openRouter.value.error ??
        decisionQ.state.value.error)
      : null,
  );

  return {
    results,
    isPending: computed(
      () =>
        enabled.value &&
        (artificialQ.state.value.pending ||
          openSourceQ.state.value.pending ||
          openRouter.value.pending ||
          decisionQ.state.value.pending),
    ),
    isError: computed(() => error.value !== null),
    error,
    partial: computed(
      () =>
        artificialQ.state.value.partial ||
        openSourceQ.state.value.partial ||
        openRouter.value.partial ||
        decisionQ.state.value.partial,
    ),
  };
}

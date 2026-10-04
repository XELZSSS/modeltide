import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/api-queries";
import { unwrapListPartial } from "@/client/api/payload-normalize";
import type { SearchResult } from "@/client/search/types";
import type { OpenRouterRankEntry } from "@/shared/types";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { foldSearchStr } from "@/client/search/match";
import { EMPTY_ARRAY } from "@/client/utils/empty";
import {
  defineSource,
  collect,
  detailLink,
  rankSearchHits,
  type SourceConfig,
} from "@/client/search/search-rank";

export const MIN_QUERY = 2;

interface SearchState {
  results: ComputedRef<SearchResult[]>;
  isPending: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
}

export function useSearchAllRankings(
  searchTerm: MaybeRefOrGetter<string>,
  opts?: { suspended?: MaybeRefOrGetter<boolean>; warm?: MaybeRefOrGetter<boolean> },
): SearchState {
  const baseEnabled = computed(() => toValue(searchTerm).trim().length >= MIN_QUERY);
  const warmEnabled = computed(() => toValue(opts?.warm) === true && baseEnabled.value);
  const enabled = computed(() => warmEnabled.value || (baseEnabled.value && toValue(opts?.suspended) !== true));
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = computed(() => artificialQ.data.value ?? EMPTY_ARRAY);
  const openSourceRankings = computed(() => openSourceQ.data.value ?? EMPTY_ARRAY);
  const openRouterUnwrapped = computed(() =>
    unwrapListPartial<OpenRouterRankEntry>(orQ.data.value, "openRouterRankings"),
  );
  const openRouterData = computed(() => openRouterUnwrapped.value.data);
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const orMalformedError = computed(() =>
    openRouterUnwrapped.value.malformed && openRouterData.value.length === 0
      ? new Error("Malformed openRouterRankings payload")
      : null,
  );
  const error = computed(
    () =>
      [artificialQ.error.value, openSourceQ.error.value, orQ.error.value ?? orMalformedError.value].find(
        (e): e is Error => e != null,
      ) ?? null,
  );

  const sources = computed<SourceConfig[]>(() => [
    defineSource(artificialData.value, SEARCH_FIELDS.aa, (m) => ({
      id: m.id,
      name: m.name,
      source: "modelRankings",
      score: m.intelligence_index,
      provider: m.model_creators?.name || null,
      link: detailLink("modelRankings", m.slug || m.id),
    })),
    defineSource(openRouterData.value, SEARCH_FIELDS.or, (e) => ({
      id: e.id,
      name: e.name,
      source: "openRouterRankings",
      score: null,
      provider: e.creator || null,
      link: detailLink("openRouterRankings", e.id),
    })),
    defineSource(openSourceRankings.value, SEARCH_FIELDS.os, (e) => ({
      id: e.id,
      name: e.id,
      source: "openSourceRankings",
      score: null,
      provider: e.author || null,
      link: detailLink("openSourceRankings", e.id),
    })),
    defineSource(hallucinationRankings.value, SEARCH_FIELDS.hall, (e) => ({
      id: e.id,
      name: e.model,
      source: "hallucinationRankings",
      score: e.omniscienceIndex,
      provider: null,
      link: detailLink("hallucinationRankings", e.slug || e.id),
    })),
  ]);

  const results = computed(() => {
    const needle = foldSearchStr(toValue(searchTerm));
    if (!enabled.value || !baseEnabled.value || !needle) return [];
    return rankSearchHits(sources.value.flatMap((source) => collect(source, needle)));
  });

  return {
    results,
    isPending: computed(
      () => enabled.value && (artificialQ.isPending.value || openSourceQ.isPending.value || orQ.isPending.value),
    ),
    isError: computed(
      () =>
        enabled.value &&
        (artificialQ.isError.value || openSourceQ.isError.value || orQ.isError.value || orMalformedError.value != null),
    ),
    error,
  };
}

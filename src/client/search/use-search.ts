import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/api-queries";
import { unwrapListPartial } from "@/client/api/payload-normalize";
import { modelDetailPath } from "@/shared/utils/models";
import type { SearchResult, SearchResultSource } from "@/client/search/types";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/client/config/nav-config";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { foldSearchStr, matchFolded, prepareFields, fuzzyHit, type PreparedFields } from "@/client/search/match";
import { normalizeModelKey } from "@/shared/utils";
import { EMPTY_ARRAY } from "@/client/utils/empty";

type SearchItem = ArtificialAnalysisModel | OpenRouterRankEntry | OpenSourceModelEntry | HallucinationRankingEntry;

interface PreparedEntry {
  item: SearchItem;
  fields: PreparedFields;
}

// Field preparation is pure per item object; TanStack Query structural sharing
// keeps item identity across refetches, so a WeakMap avoids recomputing
// (toLowerCase + tokenize + CJK bigrams) for every item on each data refresh.
const preparedCache = new WeakMap<object, PreparedFields>();

interface SourceConfig {
  entries: readonly PreparedEntry[];
  map(item: SearchItem): SearchResult;
}

function defineSource<T extends SearchItem>(
  items: readonly T[],
  getFields: (item: T) => (string | undefined | null)[],
  map: (item: T) => SearchResult,
): SourceConfig {
  return {
    entries: items.map((item) => {
      let fields = preparedCache.get(item);
      if (fields == null) {
        fields = prepareFields(getFields(item));
        preparedCache.set(item, fields);
      }
      return { item, fields };
    }),
    map,
  };
}

function collect(config: SourceConfig, needle: string): { result: SearchResult; match: number }[] {
  const out: { result: SearchResult; match: number }[] = [];
  const missed: PreparedEntry[] = [];
  for (const entry of config.entries) {
    const { matched, score } = matchFolded(entry.fields.folded, needle);
    if (matched) out.push({ result: config.map(entry.item), match: score });
    else missed.push(entry);
  }
  for (const entry of missed) {
    if (fuzzyHit(entry.fields, needle)) out.push({ result: config.map(entry.item), match: 1 });
  }
  return out;
}

function detailLink(source: SearchResultSource, id: string): string {
  return modelDetailPath(SEARCH_SOURCE_TO_MODEL_SOURCE[source], id);
}

interface SearchState {
  results: ComputedRef<SearchResult[]>;
  isPending: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
}

const MAX_RESULTS = 20;

export const MIN_QUERY = 2;

const SOURCE_PRIORITY: Record<SearchResultSource, number> = {
  modelRankings: 0,
  openRouterRankings: 1,
  openSourceRankings: 2,
  hallucinationRankings: 3,
};

function rankSearchHits(hits: { result: SearchResult; match: number }[]): SearchResult[] {
  const ordered = [...hits].sort(
    (a, b) =>
      b.match - a.match ||
      SOURCE_PRIORITY[a.result.source] - SOURCE_PRIORITY[b.result.source] ||
      (b.result.score ?? -Infinity) - (a.result.score ?? -Infinity),
  );
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const c of ordered) {
    const key = normalizeModelKey(c.result.name || c.result.id) || c.result.id.toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(c.result);
    if (deduped.length >= MAX_RESULTS) break;
  }
  return deduped;
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

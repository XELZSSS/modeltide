import { useMemo } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/api-queries";
import { modelDetailPath } from "@/client/utils/model-utils";
import type { SearchResult, SearchResultSource } from "@/client/search/types";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/client/config/nav-config";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { matchTerm, fuzzyMatch, usableFields } from "@/client/search/match";
import { normalizeModelKey } from "@/shared/utils";

type SearchItem = ArtificialAnalysisModel | OpenRouterRankEntry | OpenSourceModelEntry | HallucinationRankingEntry;

interface SourceConfig {
  items: readonly SearchItem[];
  getFields(item: SearchItem): (string | undefined | null)[];
  map(item: SearchItem): SearchResult;
}

function defineSource<T extends SearchItem>(
  items: readonly T[],
  getFields: (item: T) => (string | undefined | null)[],
  map: (item: T) => SearchResult,
): SourceConfig {
  return { items, getFields, map };
}

function collect(config: SourceConfig, term: string): { result: SearchResult; match: number }[] {
  const out: { result: SearchResult; match: number }[] = [];
  const missed: SearchItem[] = [];
  for (const item of config.items) {
    const fields = usableFields(config.getFields(item));
    const { matched, score } = matchTerm(fields, term);
    if (matched) out.push({ result: config.map(item), match: score });
    else missed.push(item);
  }
  for (const item of fuzzyMatch(missed, term, config.getFields)) {
    out.push({ result: config.map(item), match: 1 });
  }
  return out;
}

function detailLink(source: SearchResultSource, id: string): string {
  return modelDetailPath(SEARCH_SOURCE_TO_MODEL_SOURCE[source], id);
}

interface SearchState {
  results: SearchResult[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

const MAX_RESULTS = 20;

const EMPTY_ARRAY: never[] = [];

export const MIN_QUERY = 2;

/** Corpus priority for equally relevant hits; it also picks which entry survives dedupe below:
 *  one model lives in several corpora and their `score`s are different metrics. */
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

export function useSearchAllRankings(searchTerm: string, opts?: { suspended?: boolean; warm?: boolean }): SearchState {
  const baseEnabled = searchTerm.trim().length >= MIN_QUERY;
  // `warm` is "the search box is focused": focus alone must not fan the four corpora out, but one
  // typed character is; it overrides `suspended`, which only gates the term-driven search.
  const warmEnabled = opts?.warm === true && searchTerm.trim().length > 0;
  const enabled = warmEnabled || (baseEnabled && opts?.suspended !== true);
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? EMPTY_ARRAY;
  const openSourceRankings = openSourceQ.data ?? EMPTY_ARRAY;
  const openRouterData = orQ.data?.data ?? EMPTY_ARRAY;
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const error = [artificialQ.error, openSourceQ.error, orQ.error].find((e): e is Error | null => e != null) ?? null;

  const sources = useMemo<SourceConfig[]>(
    () => [
      defineSource(artificialData, SEARCH_FIELDS.aa, (m) => ({
        id: m.id,
        name: m.name,
        source: "modelRankings",
        score: m.intelligence_index,
        provider: m.model_creators?.name || null,
        link: detailLink("modelRankings", m.slug || m.id),
      })),
      defineSource(openRouterData, SEARCH_FIELDS.or, (e) => ({
        id: e.id,
        name: e.name,
        source: "openRouterRankings",
        score: null,
        provider: e.creator || null,
        link: detailLink("openRouterRankings", e.id),
      })),
      defineSource(openSourceRankings, SEARCH_FIELDS.os, (e) => ({
        id: e.id,
        name: e.id,
        source: "openSourceRankings",
        score: null,
        provider: e.author || null,
        link: detailLink("openSourceRankings", e.id),
      })),
      defineSource(hallucinationRankings, SEARCH_FIELDS.hall, (e) => ({
        id: e.id,
        name: e.model,
        source: "hallucinationRankings",
        score: e.omniscienceIndex,
        provider: null,
        link: detailLink("hallucinationRankings", e.slug || e.id),
      })),
    ],
    [artificialData, openRouterData, openSourceRankings, hallucinationRankings],
  );

  const results = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    // Warming alone must not surface matches: the dropdown still needs a long enough term.
    if (!enabled || !baseEnabled || !term) return [];
    return rankSearchHits(sources.flatMap((source) => collect(source, term)));
  }, [enabled, baseEnabled, searchTerm, sources]);

  return {
    results,
    isPending: enabled && (artificialQ.isPending || openSourceQ.isPending || orQ.isPending),
    isError: enabled && (artificialQ.isError || openSourceQ.isError || orQ.isError),
    error,
  };
}

import { useMemo } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/api-queries";
import { unwrapListPartial } from "@/client/api/payload-normalize";
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
import { matchTerm, fuzzyMatch, usableFields, foldSearchStr } from "@/client/search/match";
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
  const needle = foldSearchStr(term);
  const out: { result: SearchResult; match: number }[] = [];
  const missed: { item: SearchItem; fields: string[] }[] = [];
  for (const item of config.items) {
    const fields = usableFields(config.getFields(item));
    const { matched, score } = matchTerm(fields, needle);
    if (matched) out.push({ result: config.map(item), match: score });
    else missed.push({ item, fields });
  }
  if (out.length >= MAX_RESULTS) return out;
  for (const item of fuzzyMatch(missed, term)) {
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
  const warmEnabled = opts?.warm === true && searchTerm.trim().length > 0;
  const enabled = warmEnabled || (baseEnabled && opts?.suspended !== true);
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? EMPTY_ARRAY;
  const openSourceRankings = openSourceQ.data ?? EMPTY_ARRAY;
  const openRouterUnwrapped = useMemo(
    () => unwrapListPartial<OpenRouterRankEntry>(orQ.data, "openRouterRankings"),
    [orQ.data],
  );
  const openRouterData = openRouterUnwrapped.data;
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const orMalformedError =
    openRouterUnwrapped.malformed && openRouterData.length === 0
      ? new Error("Malformed openRouterRankings payload")
      : null;
  const error =
    [artificialQ.error, openSourceQ.error, orQ.error ?? orMalformedError].find((e): e is Error | null => e != null) ??
    null;

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
    if (!enabled || !baseEnabled || !term) return [];
    return rankSearchHits(sources.flatMap((source) => collect(source, term)));
  }, [enabled, baseEnabled, searchTerm, sources]);

  return {
    results,
    isPending: enabled && (artificialQ.isPending || openSourceQ.isPending || orQ.isPending),
    isError: enabled && (artificialQ.isError || openSourceQ.isError || orQ.isError || orMalformedError != null),
    error,
  };
}

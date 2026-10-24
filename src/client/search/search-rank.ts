import { modelDetailPath } from "@/shared/utils/models";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/client/nav/sources";
import { matchFolded, fuzzyHit, preparedFieldsFor, type PreparedFields } from "./match";
import { normalizeModelKey } from "@/shared/utils";
import type { SearchResult, SearchResultSource } from "./types";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";

type SearchItem = ArtificialAnalysisModel | OpenRouterRankEntry | OpenSourceModelEntry | HallucinationRankingEntry;

interface PreparedEntry {
  item: SearchItem;
  fields: PreparedFields;
}

export interface SourceConfig {
  entries: readonly PreparedEntry[];
  map(item: SearchItem): SearchResult;
}

const MAX_RESULTS = 20;
const MAX_PER_SOURCE = 50;

const SOURCE_PRIORITY: Record<SearchResultSource, number> = {
  modelRankings: 0,
  openRouterRankings: 1,
  openSourceRankings: 2,
  hallucinationRankings: 3,
};

export function defineSource<T extends SearchItem>(
  items: readonly T[],
  getFields: (item: T) => (string | undefined | null)[],
  map: (item: T) => SearchResult,
): SourceConfig {
  return {
    entries: items.map((item) => ({ item, fields: preparedFieldsFor(item, getFields) })),
    map,
  };
}

interface Candidate {
  item: SearchItem;
  match: number;
}

export function collect(
  config: SourceConfig,
  needle: string,
  limit: number = MAX_PER_SOURCE,
): { result: SearchResult; match: number }[] {
  const candidates: Candidate[] = [];
  const missed: PreparedEntry[] = [];
  for (const entry of config.entries) {
    const { matched, score } = matchFolded(entry.fields.folded, needle);
    if (matched) candidates.push({ item: entry.item, match: score });
    else missed.push(entry);
  }
  for (const entry of missed) {
    if (candidates.length >= limit) break;
    if (fuzzyHit(entry.fields, needle)) candidates.push({ item: entry.item, match: 1 });
  }
  // Map only the survivors: `config.map` builds a result object plus a detail URL, and a two-letter query can match
  // hundreds of rows in one source before the strongest `limit` are picked.
  return topPerSource(candidates, limit).map(({ item, match }) => ({ result: config.map(item), match }));
}

function topPerSource<T extends { match: number }>(hits: T[], limit: number): T[] {
  if (hits.length <= limit) return hits;
  return [...hits].sort((a, b) => b.match - a.match).slice(0, limit);
}

export function detailLink(source: SearchResultSource, id: string): string {
  return modelDetailPath(SEARCH_SOURCE_TO_MODEL_SOURCE[source], id);
}

export function rankSearchHits(hits: { result: SearchResult; match: number }[]): SearchResult[] {
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

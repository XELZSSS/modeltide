import { modelDetailPath } from "@/shared/utils/models";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/client/config/nav-config";
import { matchFolded, fuzzyHit, prepareFields, type PreparedFields } from "@/client/search/match";
import { normalizeModelKey } from "@/shared/utils";
import type { SearchResult, SearchResultSource } from "@/client/search/types";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";

export type SearchItem =
  | ArtificialAnalysisModel
  | OpenRouterRankEntry
  | OpenSourceModelEntry
  | HallucinationRankingEntry;

interface PreparedEntry {
  item: SearchItem;
  fields: PreparedFields;
}

// Per-item cache: preparation is pure and query data keeps object identity.
const preparedCache = new WeakMap<object, PreparedFields>();

export interface SourceConfig {
  entries: readonly PreparedEntry[];
  map(item: SearchItem): SearchResult;
}

export function defineSource<T extends SearchItem>(
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

export function collect(
  config: SourceConfig,
  needle: string,
  limit = MAX_PER_SOURCE,
): { result: SearchResult; match: number }[] {
  const out: { result: SearchResult; match: number }[] = [];
  const missed: PreparedEntry[] = [];
  for (const entry of config.entries) {
    const { matched, score } = matchFolded(entry.fields.folded, needle);
    if (matched) {
      out.push({ result: config.map(entry.item), match: score });
      // Skip the fuzzy pass once exact/prefix hits fill the per-source budget.
      if (out.length >= limit) return topPerSource(out, limit);
    } else missed.push(entry);
  }
  for (const entry of missed) {
    if (out.length >= limit) break;
    if (fuzzyHit(entry.fields, needle)) out.push({ result: config.map(entry.item), match: 1 });
  }
  return topPerSource(out, limit);
}

function topPerSource<T extends { match: number }>(hits: T[], limit: number): T[] {
  if (hits.length <= limit) return hits;
  return [...hits].sort((a, b) => b.match - a.match).slice(0, limit);
}

export function detailLink(source: SearchResultSource, id: string): string {
  return modelDetailPath(SEARCH_SOURCE_TO_MODEL_SOURCE[source], id);
}

const MAX_RESULTS = 20;
const MAX_PER_SOURCE = 50;

const SOURCE_PRIORITY: Record<SearchResultSource, number> = {
  modelRankings: 0,
  openRouterRankings: 1,
  openSourceRankings: 2,
  hallucinationRankings: 3,
};

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

import { useMemo } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/queries";
import { modelDetailPath } from "@/client/utils";
import type { SearchResult, SearchResultSource } from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/shared/config";
import { matchTerm } from "@/shared/lib/match";

interface SourceConfig<T> {
  items: T[];
  getFields: (item: T) => (string | undefined | null)[];
  map: (item: T) => SearchResult;
}

function collect<T>(config: SourceConfig<T>, term: string, out: { result: SearchResult; match: number }[]): void {
  for (const item of config.items) {
    const fields = config.getFields(item).map((v) => (v ? v.toLowerCase().trim() : ""));
    const { matched, score } = matchTerm(fields, term);
    if (!matched) continue;
    out.push({ result: config.map(item), match: score });
  }
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

/** Searches all ranking datasets for `searchTerm`. */
export function useSearchAllRankings(searchTerm: string): SearchState {
  // Trim first: whitespace-only input must not trigger upstream queries.
  const enabled = searchTerm.trim().length >= 2;
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? [];
  const openSourceRankings = openSourceQ.data;
  const openRouterData = orQ.data?.tokenUsageRankings ?? [];
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const error = [artificialQ.error, openSourceQ.error, orQ.error].find((e): e is Error | null => e != null) ?? null;

  const results = useMemo(() => {
    if (!enabled) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return [];
    const collected: { result: SearchResult; match: number }[] = [];
    collect(
      {
        items: artificialData,
        getFields: (m) => [m.name, m.slug, m.short_name, m.model_creators?.name],
        map: (m) => ({
          id: m.id,
          name: m.name,
          source: "modelRankings",
          score: m.intelligence_index,
          provider: m.model_creators?.name || null,
          link: detailLink("modelRankings", m.slug || m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: openRouterData,
        getFields: (m) => [m.name, m.id, m.creator],
        map: (m) => ({
          id: m.id,
          name: m.name,
          source: "openRouterRankings",
          score: null,
          provider: m.creator || null,
          link: detailLink("openRouterRankings", m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: openSourceRankings ?? [],
        getFields: (m) => [m.id, m.author ?? ""],
        map: (m) => ({
          id: m.id,
          name: m.id,
          source: "openSourceRankings",
          score: null,
          provider: m.author || null,
          link: detailLink("openSourceRankings", m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: hallucinationRankings,
        getFields: (m) => [m.model, m.slug, m.id],
        map: (m) => ({
          id: m.id,
          name: m.model,
          source: "hallucinationRankings",
          score: m.omniscienceIndex,
          provider: null,
          link: detailLink("hallucinationRankings", m.slug || m.id),
        }),
      },
      term,
      collected,
    );
    collected.sort((a, b) => b.match - a.match || (b.result.score ?? -Infinity) - (a.result.score ?? -Infinity));
    return collected.map((c) => c.result).slice(0, MAX_RESULTS);
  }, [enabled, searchTerm, artificialData, openRouterData, openSourceRankings, hallucinationRankings]);

  return {
    results,
    isPending: enabled && (artificialQ.isPending || openSourceQ.isPending || orQ.isPending),
    isError: enabled && (artificialQ.isError || openSourceQ.isError || orQ.isError),
    error,
  };
}

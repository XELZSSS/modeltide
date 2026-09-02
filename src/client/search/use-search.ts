import { useMemo } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/queries";
import { modelDetailPath } from "@/client/utils/model";
import type { SearchResult, SearchResultSource } from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/shared/config";
import { matchTerm } from "@/shared/utils";

interface SourceConfig<T> {
  items: T[];
  getFields: (item: T) => (string | undefined | null)[];
  map: (item: T) => SearchResult;
}

function collect<T>(config: SourceConfig<T>, term: string): { result: SearchResult; match: number }[] {
  const out: { result: SearchResult; match: number }[] = [];
  for (const item of config.items) {
    const fields = config.getFields(item).map((v) => (v ? v.toLowerCase().trim() : ""));
    const { matched, score } = matchTerm(fields, term);
    if (!matched) continue;
    out.push({ result: config.map(item), match: score });
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

export function useSearchAllRankings(searchTerm: string, opts?: { suspended?: boolean }): SearchState {
  const baseEnabled = searchTerm.trim().length >= 2;
  const enabled = baseEnabled && !opts?.suspended;
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? EMPTY_ARRAY;
  const openSourceRankings = openSourceQ.data ?? EMPTY_ARRAY;
  const openRouterData = orQ.data?.tokenUsageRankings ?? EMPTY_ARRAY;
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const error = [artificialQ.error, openSourceQ.error, orQ.error].find((e): e is Error | null => e != null) ?? null;

  const results = useMemo(() => {
    if (!enabled) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return [];
    const collected = [
      collect(
        {
          items: artificialData,
          getFields: (m) => [m.name, m.slug, m.short_name, m.model_creators?.name],
          map: (m): SearchResult => ({
            id: m.id,
            name: m.name,
            source: "modelRankings",
            score: m.intelligence_index,
            provider: m.model_creators?.name || null,
            link: detailLink("modelRankings", m.slug || m.id),
          }),
        },
        term,
      ),
      collect(
        {
          items: openRouterData,
          getFields: (m) => [m.name, m.id, m.creator],
          map: (m): SearchResult => ({
            id: m.id,
            name: m.name,
            source: "openRouterRankings",
            score: null,
            provider: m.creator || null,
            link: detailLink("openRouterRankings", m.id),
          }),
        },
        term,
      ),
      collect(
        {
          items: openSourceRankings,
          getFields: (m) => [m.id, m.author ?? ""],
          map: (m): SearchResult => ({
            id: m.id,
            name: m.id,
            source: "openSourceRankings",
            score: null,
            provider: m.author || null,
            link: detailLink("openSourceRankings", m.id),
          }),
        },
        term,
      ),
      collect(
        {
          items: hallucinationRankings,
          getFields: (m) => [m.model, m.slug, m.id],
          map: (m): SearchResult => ({
            id: m.id,
            name: m.model,
            source: "hallucinationRankings",
            score: m.omniscienceIndex,
            provider: null,
            link: detailLink("hallucinationRankings", m.slug || m.id),
          }),
        },
        term,
      ),
    ].flat();
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

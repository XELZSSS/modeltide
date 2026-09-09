"use client";
import { useMemo } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/queries";
import { modelDetailPath } from "@/client/utils/model";
import { fuzzyMatch } from "@/client/utils/fuzzy";
import type { SearchResult, SearchResultSource } from "@/shared/types";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/shared/config";
import { matchTerm } from "@/shared/utils";

interface SourceConfig<T> {
  items: T[];
  getFields: (item: T) => (string | undefined | null)[];
  map: (item: T) => SearchResult;
}

function collect<T>(config: SourceConfig<T>, term: string): { result: SearchResult; match: number }[] {
  const out: { result: SearchResult; match: number }[] = [];
  const missed: T[] = [];
  for (const item of config.items) {
    const fields = config.getFields(item).filter((v): v is string => typeof v === "string" && v.length > 0);
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

export function useSearchAllRankings(searchTerm: string, opts?: { suspended?: boolean }): SearchState {
  const baseEnabled = searchTerm.trim().length >= 2;
  const enabled = baseEnabled && !opts?.suspended;
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? (EMPTY_ARRAY as ArtificialAnalysisModel[]);
  const openSourceRankings = openSourceQ.data ?? EMPTY_ARRAY;
  const openRouterData = orQ.data?.tokenUsageRankings ?? EMPTY_ARRAY;
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const error = [artificialQ.error, openSourceQ.error, orQ.error].find((e): e is Error | null => e != null) ?? null;

  const sources = useMemo<SourceConfig<unknown>[]>(
    () => [
      {
        items: artificialData,
        getFields: (m) => {
          const model = m as ArtificialAnalysisModel;
          return [model.name, model.slug, model.short_name, model.model_creators?.name];
        },
        map: (m): SearchResult => {
          const model = m as ArtificialAnalysisModel;
          return {
            id: model.id,
            name: model.name,
            source: "modelRankings",
            score: model.intelligence_index,
            provider: model.model_creators?.name || null,
            link: detailLink("modelRankings", model.slug || model.id),
          };
        },
      },
      {
        items: openRouterData,
        getFields: (m) => {
          const e = m as OpenRouterRankEntry;
          return [e.name, e.id, e.creator];
        },
        map: (m): SearchResult => {
          const e = m as OpenRouterRankEntry;
          return {
            id: e.id,
            name: e.name,
            source: "openRouterRankings",
            score: null,
            provider: e.creator || null,
            link: detailLink("openRouterRankings", e.id),
          };
        },
      },
      {
        items: openSourceRankings,
        getFields: (m) => {
          const e = m as OpenSourceModelEntry;
          return [e.id, e.author ?? ""];
        },
        map: (m): SearchResult => {
          const e = m as OpenSourceModelEntry;
          return {
            id: e.id,
            name: e.id,
            source: "openSourceRankings",
            score: null,
            provider: e.author || null,
            link: detailLink("openSourceRankings", e.id),
          };
        },
      },
      {
        items: hallucinationRankings,
        getFields: (m) => {
          const e = m as HallucinationRankingEntry;
          return [e.model, e.slug, e.id];
        },
        map: (m): SearchResult => {
          const e = m as HallucinationRankingEntry;
          return {
            id: e.id,
            name: e.model,
            source: "hallucinationRankings",
            score: e.omniscienceIndex,
            provider: null,
            link: detailLink("hallucinationRankings", e.slug || e.id),
          };
        },
      },
    ],
    [artificialData, openRouterData, openSourceRankings, hallucinationRankings],
  );

  const results = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!enabled || !term) return [];
    const collected = sources.flatMap((source) => collect(source, term));
    collected.sort((a, b) => b.match - a.match || (b.result.score ?? -Infinity) - (a.result.score ?? -Infinity));
    return collected.map((c) => c.result).slice(0, MAX_RESULTS);
  }, [enabled, searchTerm, sources]);

  return {
    results,
    isPending: enabled && (artificialQ.isPending || openSourceQ.isPending || orQ.isPending),
    isError: enabled && (artificialQ.isError || openSourceQ.isError || orQ.isError),
    error,
  };
}

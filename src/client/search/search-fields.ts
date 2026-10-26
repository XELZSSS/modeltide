import type { ModelSource } from "@/shared/types/app";
import type {
  ArtificialAnalysisModel,
  DecisionIndexEntry,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";

interface SourceSearchRow {
  aa: ArtificialAnalysisModel;
  or: OpenRouterRankEntry;
  os: OpenSourceModelEntry;
  hall: HallucinationRankingEntry;
  decision: DecisionIndexEntry;
}

type SearchFieldAccessor<T> = (item: T) => (string | null | undefined)[];

export const SEARCH_FIELDS = {
  aa: (m: ArtificialAnalysisModel) => [m.name, m.slug, m.short_name, m.model_creators?.name],
  or: (e: OpenRouterRankEntry) => [e.name, e.id, e.creator],
  os: (e: OpenSourceModelEntry) => [e.id, e.author ?? ""],
  hall: (e: HallucinationRankingEntry) => [e.model, e.slug, e.id],
  decision: (e: DecisionIndexEntry) => [e.name, e.creator, e.id],
} satisfies { [K in ModelSource]: SearchFieldAccessor<SourceSearchRow[K]> };

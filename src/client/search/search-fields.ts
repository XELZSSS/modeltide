import type { ModelSource } from "@/client/config/nav-config";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  OpenRouterRankEntry,
  OpenSourceModelEntry,
} from "@/shared/types";

interface SourceSearchRow {
  aa: ArtificialAnalysisModel;
  or: OpenRouterRankEntry;
  os: OpenSourceModelEntry;
  hall: HallucinationRankingEntry;
}

type SearchFieldAccessor<T> = (item: T) => (string | null | undefined)[];

/**
 * The single per-source field list, shared by the global dropdown and the table row filter:
 * both must match on the same superset so a term that finds a row in the dropdown also
 * finds it in the table underneath.
 */
export const SEARCH_FIELDS = {
  aa: (m: ArtificialAnalysisModel) => [m.name, m.slug, m.short_name, m.model_creators?.name],
  or: (e: OpenRouterRankEntry) => [e.name, e.id, e.creator],
  os: (e: OpenSourceModelEntry) => [e.id, e.author ?? ""],
  hall: (e: HallucinationRankingEntry) => [e.model, e.slug, e.id],
} satisfies { [K in ModelSource]: SearchFieldAccessor<SourceSearchRow[K]> };

import type { OrMetaEntry } from "@/server/openrouter/wire";
import type { ArtificialAnalysisModel } from "@/shared/types";

/**
 * The directory's index key, without the expiry date that shares the record: only the three indices are backfilled.
 * `Exclude` over `keyof OrMetaEntry` drops a renamed field out of the union, and the table below then fails to compile.
 */
type IndexMetaKey = Exclude<keyof OrMetaEntry, "expiresAt">;

/**
 * The model field it backfills, as a union of literal names: indexing `ArtificialAnalysisModel` with a name it does not
 * have is a type error.
 */
type IndexModelKey = Extract<"intelligence_index" | "agentic_index" | "coding_index", keyof ArtificialAnalysisModel>;

/** The AA index fields the OpenRouter directory carries, as the metadata key and the leaderboard field it backfills. `recordMeta`, `mergeMetaRecord` and `backfillFromMeta` all walk this one table; the directory's `artificial_analysis` block spells all three exactly as the model does. */
export const INDEX_FIELDS: readonly { meta: IndexMetaKey; model: IndexModelKey }[] = [
  { meta: "intelligenceIndex", model: "intelligence_index" },
  { meta: "agenticIndex", model: "agentic_index" },
  { meta: "codingIndex", model: "coding_index" },
];

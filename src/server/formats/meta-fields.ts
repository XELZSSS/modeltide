type IndexMetaKey = "intelligenceIndex" | "agenticIndex" | "codingIndex";
type IndexModelKey = "intelligence_index" | "agentic_index" | "coding_index";

/**
 * The AA index fields the OpenRouter directory carries, as the metadata key and the leaderboard field it backfills.
 *
 * All three places that touch these fields — filing a directory row (`recordMeta`), merging two directory rows
 * (`mergeMetaRecord`) and backfilling a leaderboard model (`backfillFromMeta`) — walk this one table. Updating two of
 * the three by hand compiled fine and read as "the upstream stopped sending the field", not as a missed edit; the
 * directory's `artificial_analysis` block spells all three exactly as the model does.
 */
export const INDEX_FIELDS: readonly { meta: IndexMetaKey; model: IndexModelKey }[] = [
  { meta: "intelligenceIndex", model: "intelligence_index" },
  { meta: "agenticIndex", model: "agentic_index" },
  { meta: "codingIndex", model: "coding_index" },
];

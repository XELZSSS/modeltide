import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";

/**
 * The AA model behind a hallucination row. Both lists come from the same AA payload and the row carries that model's
 * `id` and `slug`, so identity is an exact lookup.
 *
 * Matching on the display name instead — the previous approach — could not work: the ranking names carry the
 * reasoning-effort suffix in parentheses ("Claude Opus 5.5 (Max, Default Fallback)"), which `normalizeModelKey`
 * deliberately strips so that a search for "Claude Opus 5.5" still reaches the model. That collapsed distinct models
 * onto one key, and the "a key must name exactly one model" rule then answered 122 of the 260 live rows with
 * "not available" — an empty panel for a model whose data was right there.
 */
export function findAaModelForHallEntry(
  models: readonly ArtificialAnalysisModel[],
  entry: HallucinationRankingEntry,
): ArtificialAnalysisModel | undefined {
  return models.find((model) => model.id === entry.id) ?? models.find((model) => model.slug === entry.slug);
}

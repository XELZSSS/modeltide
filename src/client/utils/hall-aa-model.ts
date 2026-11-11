import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";

/** The AA model behind a hallucination row: both lists come from the same AA payload and the row carries that model's `id`
 * and `slug`, so identity is an exact lookup. Matching on the display name cannot work — the ranking names carry the
 * reasoning-effort suffix that `normalizeModelKey` deliberately strips, which collapses distinct models onto one key. */
export function findAaModelForHallEntry(
  models: readonly ArtificialAnalysisModel[],
  entry: HallucinationRankingEntry,
): ArtificialAnalysisModel | undefined {
  return models.find((model) => model.id === entry.id) ?? models.find((model) => model.slug === entry.slug);
}

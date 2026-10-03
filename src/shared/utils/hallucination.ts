import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";

export function buildHallucinationRankings(models: ArtificialAnalysisModel[]): HallucinationRankingEntry[] {
  // for-loop + push avoids a throwaway empty array per model without data.
  const out: HallucinationRankingEntry[] = [];
  for (const model of models) {
    const total = model.omniscience_breakdown?.total;
    if (total?.omniscience == null) continue;
    out.push({
      id: model.id,
      slug: model.slug,
      model: model.name,
      hallucinationRate: total.hallucination_rate ?? null,
      accuracy: total.accuracy ?? null,
      attemptRate: total.attempt_rate ?? null,
      omniscienceIndex: total.omniscience,
    });
  }
  return out.sort((a, b) => (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity));
}

export function isHallucinationDataUnavailable(
  models: ArtificialAnalysisModel[],
  rankings: HallucinationRankingEntry[],
): boolean {
  return models.length > 0 && rankings.length === 0;
}

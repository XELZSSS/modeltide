import type { ArtificialAnalysisModel } from "@/shared/types/catalog";
import type { HallucinationRankingEntry } from "@/shared/types/rankings";

export function buildHallucinationRankings(models: ArtificialAnalysisModel[]): HallucinationRankingEntry[] {
  const out: HallucinationRankingEntry[] = [];
  for (const model of models) {
    const total = model.omniscience_breakdown?.total;
    if (total?.omniscience == null) continue;
    out.push({
      id: model.id,
      slug: model.slug,
      model: model.name,
      hallucinationRate: total.hallucination_rate,
      accuracy: total.accuracy,
      attemptRate: total.attempt_rate,
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

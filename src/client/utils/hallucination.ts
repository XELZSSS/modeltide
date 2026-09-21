import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";

export function buildHallucinationRankings(models: ArtificialAnalysisModel[]): HallucinationRankingEntry[] {
  return models
    .flatMap((model) => {
      const total = model.omniscience_breakdown?.total;
      if (total?.omniscience == null) return [];
      return [
        {
          id: model.id,
          slug: model.slug,
          model: model.name,
          // Already 0-100 (parsers/aa/compact.ts): re-normalizing inflated sub-1% by 100x.
          hallucinationRate: total.hallucination_rate ?? null,
          accuracy: total.accuracy ?? null,
          attemptRate: total.attempt_rate ?? null,
          omniscienceIndex: total.omniscience,
        },
      ];
    })
    .sort((a, b) => (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity));
}

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
          // Server already normalizes to 0-100 (parsers/aa/model-compact.ts) — pass through, no re-scaling here.
          hallucinationRate: total.hallucination_rate ?? null,
          accuracy: total.accuracy ?? null,
          attemptRate: total.attempt_rate ?? null,
          omniscienceIndex: total.omniscience,
        },
      ];
    })
    .sort((a, b) => (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity));
}

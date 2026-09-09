import { normalizePercent } from "@/shared/utils";
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
          hallucinationRate: normalizePercent(total.hallucination_rate),
          accuracy: normalizePercent(total.accuracy),
          attemptRate: normalizePercent(total.attempt_rate),
          omniscienceIndex: total.omniscience,
        },
      ];
    })
    .sort((a, b) => (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity));
}

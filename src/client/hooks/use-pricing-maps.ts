import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { estimateCost, type CostEstimate } from "@/shared/utils/cost";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing, type EffectivePricing } from "@/shared/utils/pricing";
import { parseCostFields, type CostFieldValues } from "@/shared/scenario";
import type { ArtificialAnalysisModel } from "@/shared/types/catalog";

/** The two per-model figures the pricing surfaces read: the cost estimate and the resolved price legs, both keyed by
 * `modelId` and built in one walk. */
export function usePricingMaps(
  models: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  values: MaybeRefOrGetter<CostFieldValues>,
) {
  const scenario = computed(() => parseCostFields(toValue(values)));
  const maps = computed(() => {
    const estimates = new Map<string, CostEstimate>();
    const effective = new Map<string, EffectivePricing>();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (!key) continue;
      effective.set(key, resolveEffectivePricing(model.pricing));
      const estimate = estimateCost(model.pricing, scenario.value);
      if (estimate) estimates.set(key, estimate);
    }
    return { estimates, effective };
  });
  return {
    costEstimates: computed(() => maps.value.estimates),
    effectivePricing: computed(() => maps.value.effective),
  };
}

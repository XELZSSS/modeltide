import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { estimateCost, type CostEstimate } from "@/shared/utils/cost";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing } from "@/shared/utils/pricing";
import { parseCostFields, type CostFieldValues } from "@/shared/scenario";
import type { ArtificialAnalysisModel } from "@/shared/types/catalog";

export function usePricingMaps(
  models: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  values: MaybeRefOrGetter<CostFieldValues>,
) {
  const scenario = computed(() => parseCostFields(toValue(values)));
  // One estimate per model, the same object every price display reads: the billing legs, the blended $/M and the
  // monthly cost cannot drift apart because they are not computed separately.
  const costEstimates = computed(() => {
    const map = new Map<string, CostEstimate>();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (!key) continue;
      const estimate = estimateCost(model.pricing, scenario.value);
      if (estimate) map.set(key, estimate);
    }
    return map;
  });
  const monthlyCosts = computed(() => {
    const map = new Map<string, number | null>();
    for (const [key, estimate] of costEstimates.value) map.set(key, estimate.monthlyCost);
    return map;
  });
  const effectivePricing = computed(() => {
    const map = new Map<string, ReturnType<typeof resolveEffectivePricing>>();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (key) map.set(key, resolveEffectivePricing(model.pricing));
    }
    return map;
  });
  return { monthlyCosts, effectivePricing, costEstimates };
}

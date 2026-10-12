import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { monthlyCostFor } from "@/shared/utils/cost";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing } from "@/shared/utils/pricing";
import { parseCostFields, type CostFieldValues } from "@/shared/pricing/scenario";
import type { ArtificialAnalysisModel } from "@/shared/types/catalog";

export function usePricingMaps(
  models: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  values: MaybeRefOrGetter<CostFieldValues>,
) {
  const scenario = computed(() => parseCostFields(toValue(values)));
  const monthlyCosts = computed(() => {
    const map = new Map<string, number | null>();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (!key || map.has(key)) continue;
      map.set(key, monthlyCostFor(model.pricing, scenario.value));
    }
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
  return { scenario, monthlyCosts, effectivePricing };
}

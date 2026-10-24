import { computed, type ComputedRef } from "vue";
import type { ModelPricing } from "@/shared/types/catalog";
import { estimateCost } from "@/shared/utils/cost";
import { resolveEffectivePricing, PRICE_LEGS, type EffectivePricing } from "@/shared/utils/pricing";
import { parseCostFields } from "@/shared/scenario";
import { useCostStore } from "@/client/stores";

export function usePricing(pricing: () => ModelPricing | EffectivePricing | null | undefined): {
  effective: ComputedRef<EffectivePricing>;
  blended: ComputedRef<number | null>;
  cacheWrite: ComputedRef<number | null | undefined>;
} {
  const costStore = useCostStore();
  const effective = computed(() => resolveEffectivePricing(pricing()));
  // The same estimator the ranking table uses: the detail card's blended price follows the persisted cost scenario,
  // so it cannot disagree with the monthly figure the reader compares it to.
  const blended = computed(() => estimateCost(pricing(), parseCostFields(costStore.values))?.blendedPrice ?? null);
  const cacheWrite = computed(() => PRICE_LEGS.cacheWritePrice(effective.value));
  return { effective, blended, cacheWrite };
}

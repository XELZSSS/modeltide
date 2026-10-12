import { computed, type ComputedRef } from "vue";
import type { ModelPricing } from "@/shared/types/catalog";
import { computeBlendPrice } from "@/shared/utils/cost";
import { resolveEffectivePricing, PRICE_LEGS, type EffectivePricing } from "@/shared/utils/pricing";

export function usePricing(pricing: () => ModelPricing | null | undefined): {
  effective: ComputedRef<EffectivePricing>;
  blended: ComputedRef<number | null>;
  cacheWrite: ComputedRef<number | null | undefined>;
} {
  const effective = computed(() => resolveEffectivePricing(pricing()));
  const blended = computed(() => computeBlendPrice(effective.value));
  const cacheWrite = computed(() => PRICE_LEGS.cacheWritePrice(effective.value));
  return { effective, blended, cacheWrite };
}

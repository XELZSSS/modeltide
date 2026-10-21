import { computed, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TranslationKey } from "@/shared/i18n";
import { usePricingMaps } from "@/client/hooks/use-pricing-maps";
import { useCostStore } from "@/client/stores";

import type { ArtificialAnalysisModel } from "@/shared/types";

export const COST_FIELDS = [
  { id: "dailyInput", labelKey: "dailyPromptTokens", unit: "M" },
  { id: "dailyOutput", labelKey: "dailyCompletionTokens", unit: "M" },
  { id: "dailyReasoning", labelKey: "dailyReasoningTokens", unit: "M" },
  { id: "cacheHitRate", labelKey: "cacheHitRate", unit: "%" },
  { id: "cacheWriteRate", labelKey: "cacheWriteRate", unit: "%" },
  { id: "daysPerMonth", labelKey: "daysPerMonth", unit: undefined },
] as const satisfies readonly { id: CostFieldId; labelKey: TranslationKey; unit?: string }[];

export type CostFieldId =
  | "dailyInput"
  | "dailyOutput"
  | "dailyReasoning"
  | "cacheHitRate"
  | "cacheWriteRate"
  | "daysPerMonth";

export interface CostInputState {
  values: ComputedRef<Record<CostFieldId, string>>;
  setField: (id: CostFieldId, v: string) => void;
}

function useCostEstimator() {
  const store = useCostStore();
  const values = computed(() => store.values);
  const setField = (id: CostFieldId, v: string): void => store.setField(id, v);

  return { values, setField };
}

export function useMonthlyCosts(models: MaybeRefOrGetter<ArtificialAnalysisModel[]>) {
  const estimator = useCostEstimator();

  const { monthlyCosts } = usePricingMaps(models, () => estimator.values.value);

  return { ...estimator, monthlyCosts };
}

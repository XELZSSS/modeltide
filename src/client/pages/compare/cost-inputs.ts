import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TranslationKey } from "@/shared/i18n";
import { monthlyCostFor } from "@/shared/utils";
import { parseCostFields, type CostFieldValues } from "@/shared/scenario";
import { modelId } from "@/shared/utils/models";
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

  const calc = computed(() => parseCostFields(values.value as CostFieldValues));

  return { values, setField, calc };
}

type MonthlyCostMap = Map<string, number | null>;

export function useMonthlyCosts(models: MaybeRefOrGetter<ArtificialAnalysisModel[]>) {
  const estimator = useCostEstimator();

  const monthlyCosts = computed<MonthlyCostMap>(() => {
    const map: MonthlyCostMap = new Map();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (!key || map.has(key)) continue;
      map.set(key, monthlyCostFor(model.pricing, estimator.calc.value));
    }
    return map;
  });

  return { ...estimator, monthlyCosts };
}

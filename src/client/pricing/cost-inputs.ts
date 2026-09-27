import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TranslationKey } from "@/shared/i18n";
import { monthlyCostFor, type CostScenario } from "@/shared/utils";
import { modelId } from "@/client/utils/model-utils";
import { resolveEffectivePricing } from "@/client/utils/pricing";
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

  const calc = computed<CostScenario>(() => {
    const current = values.value;
    return {
      dailyInputM: Math.max(0, Number(current.dailyInput) || 0),
      dailyOutputM: Math.max(0, Number(current.dailyOutput) || 0),
      dailyReasoningM: Math.max(0, Number(current.dailyReasoning) || 0),
      cacheHitRate: Math.max(0, Math.min(100, Number(current.cacheHitRate) || 0)) / 100,
      cacheWriteRate: Math.max(0, Math.min(100, Number(current.cacheWriteRate) || 0)) / 100,
      daysPerMonth: Math.max(1, Number(current.daysPerMonth) || 0),
    };
  });

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

export function useEffectivePricingMap(models: MaybeRefOrGetter<ArtificialAnalysisModel[]>) {
  return computed(() => {
    const map = new Map<string, ReturnType<typeof resolveEffectivePricing>>();
    for (const model of toValue(models)) {
      const key = modelId(model);
      if (key) map.set(key, resolveEffectivePricing(model.pricing));
    }
    return map;
  });
}

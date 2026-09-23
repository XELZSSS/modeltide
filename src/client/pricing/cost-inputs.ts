import { useDeferredValue, useMemo } from "react";
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
  values: Record<CostFieldId, string>;
  setField: (id: CostFieldId, v: string) => void;
}

interface CostEstimatorState extends CostInputState {
  calc: CostScenario;
}

function useCostEstimator(): CostEstimatorState {
  const values = useCostStore((s) => s.values);
  const setField = useCostStore((s) => s.setField);
  const deferred = useDeferredValue(values);

  const calc = useMemo<CostScenario>(
    () => ({
      dailyInputM: Math.max(0, Number(deferred.dailyInput) || 0),
      dailyOutputM: Math.max(0, Number(deferred.dailyOutput) || 0),
      dailyReasoningM: Math.max(0, Number(deferred.dailyReasoning) || 0),
      cacheHitRate: Math.max(0, Math.min(100, Number(deferred.cacheHitRate) || 0)) / 100,
      cacheWriteRate: Math.max(0, Math.min(100, Number(deferred.cacheWriteRate) || 0)) / 100,
      daysPerMonth: Math.max(1, Number(deferred.daysPerMonth) || 0),
    }),
    [deferred],
  );

  return useMemo(() => ({ values, setField, calc }), [values, setField, calc]);
}

type MonthlyCostMap = Map<string, number | null>;

/** Monthly cost per modelId(); keyed so a reordered or filtered list cannot pair a cost with the wrong row. */
export function useMonthlyCosts(models: ArtificialAnalysisModel[]) {
  const estimator = useCostEstimator();
  const { calc } = estimator;
  const monthlyCosts = useMemo<MonthlyCostMap>(() => {
    const map: MonthlyCostMap = new Map();
    for (const model of models) {
      const key = modelId(model);
      if (!key || map.has(key)) continue;
      map.set(key, monthlyCostFor(model.pricing, calc));
    }
    return map;
  }, [models, calc]);
  return { ...estimator, monthlyCosts };
}

export function useEffectivePricingMap(models: ArtificialAnalysisModel[]) {
  return useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveEffectivePricing>>();
    for (const m of models) {
      const key = modelId(m);
      if (key) map.set(key, resolveEffectivePricing(m.pricing));
    }
    return map;
  }, [models]);
}

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { TranslationKey } from "@/shared/i18n";
import { calcMonthlyCost } from "@/client/utils/cost-estimator";
import type { OfficialGetter } from "@/client/utils/pricing-merge";
import type { ArtificialAnalysisModel } from "@/shared/types";

export const COST_FIELDS = [
  { id: "dailyInput", labelKey: "dailyPromptTokens", unit: "M" },
  { id: "dailyOutput", labelKey: "dailyCompletionTokens", unit: "M" },
  { id: "dailyReasoning", labelKey: "dailyReasoningTokens", unit: "M" },
  { id: "cacheHitRate", labelKey: "cacheHitRate", unit: "%" },
  { id: "daysPerMonth", labelKey: "daysPerMonth", unit: undefined },
] as const satisfies readonly { id: CostFieldId; labelKey: TranslationKey; unit?: string }[];

export type CostFieldId = "dailyInput" | "dailyOutput" | "dailyReasoning" | "cacheHitRate" | "daysPerMonth";

export interface CostInputState {
  values: Record<CostFieldId, string>;
  setField: (id: CostFieldId, v: string) => void;
}

export const DEFAULT_COST_INPUTS: Record<CostFieldId, string> = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  daysPerMonth: "22",
};

interface CostEstimatorState extends CostInputState {
  calc: { input: number; output: number; reasoning: number; cache: number; days: number };
}

function useCostEstimator(): CostEstimatorState {
  const [values, setValues] = useState<Record<CostFieldId, string>>(DEFAULT_COST_INPUTS);
  const setField = useCallback((id: CostFieldId, v: string) => {
    setValues((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }));
  }, []);
  const deferred = useDeferredValue(values);

  const calc = useMemo(
    () => ({
      input: Math.max(0, Number(deferred.dailyInput) || 0),
      output: Math.max(0, Number(deferred.dailyOutput) || 0),
      reasoning: Math.max(0, Number(deferred.dailyReasoning) || 0),
      cache: Math.max(0, Math.min(100, Number(deferred.cacheHitRate) || 0)) / 100,
      days: Math.max(1, Number(deferred.daysPerMonth) || 0),
    }),
    [deferred],
  );

  return useMemo(() => ({ values, setField, calc }), [values, setField, calc]);
}

export function useMonthlyCosts(models: ArtificialAnalysisModel[], getOfficial?: OfficialGetter) {
  const estimator = useCostEstimator();
  const { calc } = estimator;
  const monthlyCosts = useMemo(() => {
    const opts = {
      dailyInput: calc.input * 1_000_000,
      dailyOutput: calc.output * 1_000_000,
      dailyReasoning: calc.reasoning * 1_000_000,
      cacheHitRate: calc.cache,
      daysPerMonth: calc.days,
    };
    return models.map((model) => calcMonthlyCost(model, opts, getOfficial?.(model)));
  }, [models, calc, getOfficial]);
  return { ...estimator, monthlyCosts };
}

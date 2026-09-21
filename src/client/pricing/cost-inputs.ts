"use client";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { TranslationKey } from "@/shared/i18n";
import { calcMonthlyCost } from "@/client/utils/cost-estimator";
import { modelId } from "@/client/utils/model-utils";
import { resolveEffectivePricing, type OfficialGetter } from "@/client/utils/pricing-merge";
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

const DEFAULT_COST_INPUTS: Record<CostFieldId, string> = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  cacheWriteRate: "5",
  daysPerMonth: "22",
};

interface CostEstimatorState extends CostInputState {
  calc: {
    input: number;
    output: number;
    reasoning: number;
    cache: number;
    cacheWrite: number;
    days: number;
  };
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
      cacheWrite: Math.max(0, Math.min(100, Number(deferred.cacheWriteRate) || 0)) / 100,
      days: Math.max(1, Number(deferred.daysPerMonth) || 0),
    }),
    [deferred],
  );

  return useMemo(() => ({ values, setField, calc }), [values, setField, calc]);
}

export function getCachedMonthlyCost(
  model: ArtificialAnalysisModel,
  calc: { input: number; output: number; reasoning: number; cache: number; cacheWrite: number; days: number },
  getOfficial?: OfficialGetter,
): number | null {
  const official = getOfficial?.(model);
  const isDefaultCalc =
    calc.input === 2 &&
    calc.output === 1 &&
    calc.reasoning === 2 &&
    calc.cache === 0.5 &&
    calc.cacheWrite === 0.05 &&
    calc.days === 22;
  if (isDefaultCalc && official == null) {
    const v = model.defaultMonthlyCost;
    if (v != null && Number.isFinite(v)) return v;
  }
  const opts = {
    dailyInput: calc.input * 1_000_000,
    dailyOutput: calc.output * 1_000_000,
    dailyReasoning: calc.reasoning * 1_000_000,
    cacheHitRate: calc.cache,
    cacheWriteRate: calc.cacheWrite,
    daysPerMonth: calc.days,
  };
  return calcMonthlyCost(model, opts, official);
}

type MonthlyCostMap = Map<string, number | null>;

/**
 * Monthly cost per modelId(). Keyed rather than positional so a filtered or
 * reordered model list can never pair a cost with the wrong row.
 */
export function useMonthlyCosts(
  models: ArtificialAnalysisModel[],
  getOfficial?: OfficialGetter,
  opts?: { ready?: boolean },
) {
  const estimator = useCostEstimator();
  const { calc } = estimator;
  const ready = opts?.ready ?? true;
  const monthlyCosts = useMemo<MonthlyCostMap>(() => {
    const map: MonthlyCostMap = new Map();
    if (!ready) return map;
    for (const model of models) {
      const key = modelId(model);
      if (!key || map.has(key)) continue;
      map.set(key, getCachedMonthlyCost(model, calc, getOfficial));
    }
    return map;
  }, [models, calc, getOfficial, ready]);
  return { ...estimator, monthlyCosts };
}

export function useEffectivePricingMap(models: ArtificialAnalysisModel[], getOfficial?: OfficialGetter) {
  return useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveEffectivePricing>>();
    for (const m of models) {
      const key = modelId(m);
      if (key) map.set(key, resolveEffectivePricing(m.pricing, getOfficial?.(m)));
    }
    return map;
  }, [models, getOfficial]);
}

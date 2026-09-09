"use client";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import type { TranslationKey } from "@/shared/i18n";
import { calcMonthlyCost } from "@/client/utils/cost-estimator";
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

export const DEFAULT_COST_INPUTS: Record<CostFieldId, string> = {
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

/**
 * Client-side monthly-cost cache — keyed by model identity + effective pricing + calc.
 * Avoids recomputing 200+ models when pricing unchanged (the common case).
 * LRU via insertion-order Map, 1024 entries cap.
 */
const COST_CACHE = new Map<string, number | null>();
const COST_CACHE_MAX = 1024;

function costCacheKey(
  model: ArtificialAnalysisModel,
  pricing: ReturnType<typeof resolveEffectivePricing>,
  calc: { input: number; output: number; reasoning: number; cache: number; cacheWrite: number; days: number },
): string {
  return [
    model.id,
    pricing.input ?? "",
    pricing.output ?? "",
    pricing.cacheHit ?? "",
    pricing.cacheWrite ?? "",
    calc.input,
    calc.output,
    calc.reasoning,
    calc.cache,
    calc.cacheWrite,
    calc.days,
  ].join("|");
}

function getCachedMonthlyCost(
  model: ArtificialAnalysisModel,
  calc: { input: number; output: number; reasoning: number; cache: number; cacheWrite: number; days: number },
  getOfficial?: OfficialGetter,
): number | null {
  // Fast path: server precomputed default (calc matches DEFAULT_COST_INPUTS)
  // If calc is default, reuse model.defaultMonthlyCost when available
  const isDefaultCalc =
    calc.input === 2 && calc.output === 1 && calc.reasoning === 2 && calc.cache === 0.5 && calc.cacheWrite === 0.05 && calc.days === 22;
  if (isDefaultCalc && typeof (model as unknown as { defaultMonthlyCost?: number | null }).defaultMonthlyCost === "number") {
    const v = (model as unknown as { defaultMonthlyCost: number | null }).defaultMonthlyCost;
    if (v != null && Number.isFinite(v)) return v;
  }
  const pricing = resolveEffectivePricing(model.pricing, getOfficial?.(model));
  const key = costCacheKey(model, pricing, calc);
  if (COST_CACHE.has(key)) return COST_CACHE.get(key)!;
  const opts = {
    dailyInput: calc.input * 1_000_000,
    dailyOutput: calc.output * 1_000_000,
    dailyReasoning: calc.reasoning * 1_000_000,
    cacheHitRate: calc.cache,
    cacheWriteRate: calc.cacheWrite,
    daysPerMonth: calc.days,
  };
  // calcMonthlyCost internally re-resolves pricing, but we pass pre-resolved to avoid double work:
  // Use direct calc to keep single pricing resolution
  const result = calcMonthlyCost(model, opts, getOfficial?.(model));
  COST_CACHE.set(key, result);
  if (COST_CACHE.size > COST_CACHE_MAX) {
    const first = COST_CACHE.keys().next().value as string | undefined;
    if (first) COST_CACHE.delete(first);
  }
  return result;
}

export function useMonthlyCosts(models: ArtificialAnalysisModel[], getOfficial?: OfficialGetter) {
  const estimator = useCostEstimator();
  const { calc } = estimator;
  // Stable calc key to avoid object identity churn — JSON is cheap for 6 fields
  const calcKey = `${calc.input}|${calc.output}|${calc.reasoning}|${calc.cache}|${calc.cacheWrite}|${calc.days}`;
  const getOfficialRef = useRef(getOfficial);
  getOfficialRef.current = getOfficial;
  const monthlyCosts = useMemo(() => {
    // Only compute when viewMode==="pricing" passes non-empty models; empty -> []
    if (models.length === 0) return [] as (number | null)[];
    return models.map((model) => getCachedMonthlyCost(model, calc, getOfficialRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, calcKey]);
  return { ...estimator, monthlyCosts };
}

export function useEffectivePricingMap(models: ArtificialAnalysisModel[], getOfficial?: OfficialGetter) {
  return useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveEffectivePricing>>();
    for (const m of models) map.set(m.id, resolveEffectivePricing(m.pricing, getOfficial?.(m)));
    return map;
  }, [models, getOfficial]);
}

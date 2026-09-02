import { useDeferredValue, useMemo, useState } from "react";
import { calcMonthlyCost } from "@/client/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";

export interface CostInputState {
  dailyInput: string;
  setDailyInput: (v: string) => void;
  dailyOutput: string;
  setDailyOutput: (v: string) => void;
  dailyReasoning: string;
  setDailyReasoning: (v: string) => void;
  cacheHitRate: string;
  setCacheHitRate: (v: string) => void;
  daysPerMonth: string;
  setDaysPerMonth: (v: string) => void;
}

interface CostEstimatorState extends CostInputState {
  calcInput: number;
  calcOutput: number;
  calcReasoning: number;
  calcCache: number;
  calcDays: number;
}

/** Default estimator inputs: 2M prompt + 1M completion + 2M reasoning tokens/day, 50% cache hits, 22 workdays. */
export const DEFAULT_COST_INPUTS = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  daysPerMonth: "22",
} as const;

function useCostEstimator(): CostEstimatorState {
  const [dailyInput, setDailyInput] = useState<string>(DEFAULT_COST_INPUTS.dailyInput);
  const [dailyOutput, setDailyOutput] = useState<string>(DEFAULT_COST_INPUTS.dailyOutput);
  const [dailyReasoning, setDailyReasoning] = useState<string>(DEFAULT_COST_INPUTS.dailyReasoning);
  const [cacheHitRate, setCacheHitRate] = useState<string>(DEFAULT_COST_INPUTS.cacheHitRate);
  const [daysPerMonth, setDaysPerMonth] = useState<string>(DEFAULT_COST_INPUTS.daysPerMonth);

  // Defer parsing so heavy list re-renders don't block typing in the inputs.
  // NOTE: non-numeric input (e.g. "e") parses to NaN → `|| 0` coerces to 0 silently;
  // the input stays visible so the user sees what they typed, and the estimate
  // treats it as zero rather than crashing.
  const deferredInput = useDeferredValue(dailyInput);
  const deferredOutput = useDeferredValue(dailyOutput);
  const deferredReasoning = useDeferredValue(dailyReasoning);
  const deferredCache = useDeferredValue(cacheHitRate);
  const deferredDays = useDeferredValue(daysPerMonth);

  const calcInput = Math.max(0, Number(deferredInput) || 0);
  const calcOutput = Math.max(0, Number(deferredOutput) || 0);
  const calcReasoning = Math.max(0, Number(deferredReasoning) || 0);
  // Cache hit rate is clamped to 0-100% and normalized to a 0..1 fraction for the cost math.
  const calcCache = Math.max(0, Math.min(100, Number(deferredCache) || 0)) / 100;
  const calcDays = Math.max(1, Number(deferredDays) || 0);

  return useMemo(
    () => ({
      dailyInput,
      setDailyInput,
      dailyOutput,
      setDailyOutput,
      dailyReasoning,
      setDailyReasoning,
      cacheHitRate,
      setCacheHitRate,
      daysPerMonth,
      setDaysPerMonth,
      calcInput,
      calcOutput,
      calcReasoning,
      calcCache,
      calcDays,
    }),
    [
      dailyInput,
      dailyOutput,
      dailyReasoning,
      cacheHitRate,
      daysPerMonth,
      calcInput,
      calcOutput,
      calcReasoning,
      calcCache,
      calcDays,
    ],
  );
}

export function useMonthlyCosts(models: ArtificialAnalysisModel[]) {
  const estimator = useCostEstimator();
  const { calcInput, calcOutput, calcReasoning, calcCache, calcDays } = estimator;
  const monthlyCosts = useMemo(() => {
    const opts = {
      dailyInput: calcInput * 1_000_000,
      dailyOutput: calcOutput * 1_000_000,
      dailyReasoning: calcReasoning * 1_000_000,
      cacheHitRate: calcCache,
      daysPerMonth: calcDays,
    };
    return models.map((model) => calcMonthlyCost(model, opts));
  }, [models, calcInput, calcOutput, calcReasoning, calcCache, calcDays]);
  return { ...estimator, monthlyCosts };
}

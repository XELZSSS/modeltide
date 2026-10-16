import type { CostScenario } from "./utils/cost";

export type CostFieldValues = {
  dailyInput: string;
  dailyOutput: string;
  dailyReasoning: string;
  cacheHitRate: string;
  cacheWriteRate: string;
  daysPerMonth: string;
};

const numOr = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function parseCostFields(values: CostFieldValues): CostScenario {
  return {
    dailyInputM: Math.max(0, numOr(values.dailyInput, 0)),
    dailyOutputM: Math.max(0, numOr(values.dailyOutput, 0)),
    dailyReasoningM: Math.max(0, numOr(values.dailyReasoning, 0)),
    cacheHitRate: Math.max(0, Math.min(100, numOr(values.cacheHitRate, 0))) / 100,
    cacheWriteRate: Math.max(0, Math.min(100, numOr(values.cacheWriteRate, 0))) / 100,
    daysPerMonth: Math.max(1, numOr(values.daysPerMonth, 0)),
  };
}

import { isFiniteNumber } from "@/shared/utils/numbers";
import type { ModelPricing } from "@/shared/types";

export interface CostScenario {
  dailyInputM: number;
  dailyOutputM: number;
  dailyReasoningM: number;
  cacheHitRate: number;
  cacheWriteRate: number;
  daysPerMonth: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const nonNeg = (v: number): number => Math.max(0, v);

export function monthlyCostFor(pricing: ModelPricing | undefined, scenario: CostScenario): number | null {
  if (!pricing || !isFiniteNumber(pricing.input) || !isFiniteNumber(pricing.output)) return null;
  const cacheHit = pricing.cacheHit;
  const cacheWrite = pricing.cacheWrite;
  if (cacheHit != null && !isFiniteNumber(cacheHit)) return null;
  if (cacheWrite != null && !isFiniteNumber(cacheWrite)) return null;
  const hitRate = clamp01(scenario.cacheHitRate);
  const hasWriteTier = isFiniteNumber(cacheWrite);
  const writeRate = hasWriteTier ? clamp01(Math.min(scenario.cacheWriteRate, 1 - hitRate)) : 0;
  const cached = isFiniteNumber(cacheHit) ? cacheHit : pricing.input;
  const inputRate = hitRate * cached + (hasWriteTier ? writeRate * cacheWrite : 0) + (1 - hitRate - writeRate) * pricing.input;
  const daily =
    nonNeg(scenario.dailyInputM) * inputRate +
    (nonNeg(scenario.dailyOutputM) + nonNeg(scenario.dailyReasoningM)) * pricing.output;
  const monthly = daily * Math.max(1, scenario.daysPerMonth);
  return isFiniteNumber(monthly) ? monthly : null;
}

export function computeBlendPrice(pricing: ModelPricing | undefined): number | null {
  if (!pricing || !isFiniteNumber(pricing.input) || !isFiniteNumber(pricing.output)) return null;
  // AA methodology: cache reads bill at the input rate when no cache tier exists.
  const cache = isFiniteNumber(pricing.cacheHit) ? pricing.cacheHit : pricing.input;
  return (7 * cache + 2 * pricing.input + pricing.output) / 10;
}

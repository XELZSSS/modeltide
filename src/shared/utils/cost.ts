import { isFiniteNumber } from "./number";
import type { ModelPricing } from "@/shared/types/catalog";

export interface CostScenario {
  dailyInputM: number;
  dailyOutputM: number;
  dailyReasoningM: number;
  cacheHitRate: number;
  cacheWriteRate: number;
  daysPerMonth: number;
}

/**
 * One model priced under one scenario. `blendedPrice` and `monthlyCost` come from the same numbers, so the invariant
 * `monthlyCost === blendedPrice * dailyTokensM * days` (days clamped to at least one) holds by construction: the
 * blended price is the average price of one token in this traffic mix, not a second, separately weighted figure.
 */
export interface CostEstimate {
  /** Millions of tokens per day across input, output and reasoning. */
  dailyTokensM: number;
  /** USD per month, using at least one day. */
  monthlyCost: number | null;
  /** Scenario-weighted $/M across every daily token. */
  blendedPrice: number | null;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const nonNeg = (v: number): number => Math.max(0, v);

/**
 * The only price calculation in the app. Both figures a reader compares — the blended $/M and the monthly estimate —
 * are derived here from the same effective rates and the same scenario.
 */
export function estimateCost(pricing: ModelPricing | null | undefined, scenario: CostScenario): CostEstimate | null {
  if (!pricing || !isFiniteNumber(pricing.input) || !isFiniteNumber(pricing.output)) return null;

  const hitRate = clamp01(scenario.cacheHitRate);
  const cacheHit = pricing.cacheHit;
  const cacheWrite = pricing.cacheWrite;
  const hasWriteTier = isFiniteNumber(cacheWrite);
  // A write rate without a separate write price would charge the same input twice; the write tier is dropped instead.
  const writeRate = hasWriteTier ? clamp01(Math.min(scenario.cacheWriteRate, 1 - hitRate)) : 0;
  const cached = isFiniteNumber(cacheHit) ? cacheHit : pricing.input;
  const inputRate =
    hitRate * cached + (hasWriteTier ? writeRate * cacheWrite : 0) + (1 - hitRate - writeRate) * pricing.input;

  const dailyInputM = nonNeg(scenario.dailyInputM);
  const dailyOutputM = nonNeg(scenario.dailyOutputM) + nonNeg(scenario.dailyReasoningM);
  const dailyTokensM = dailyInputM + dailyOutputM;
  const dailyCost = dailyInputM * inputRate + dailyOutputM * pricing.output;
  const monthly = dailyCost * Math.max(1, scenario.daysPerMonth);
  return {
    dailyTokensM,
    monthlyCost: isFiniteNumber(monthly) ? monthly : null,
    blendedPrice: dailyTokensM > 0 && isFiniteNumber(dailyCost) ? dailyCost / dailyTokensM : null,
  };
}

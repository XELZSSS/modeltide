import { resolveEffectivePricing } from "@/client/utils/pricing-merge";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";

interface CostEstimateOptions {
  cacheHitRate?: number;
  cacheWriteRate?: number;
  reasoningTokens?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const nonNeg = (v: number) => Math.max(0, v);

function calcCost(
  pricing: ArtificialAnalysisModel["pricing"],
  promptTokens: number,
  completionTokens: number,
  opts?: CostEstimateOptions,
): number | null {
  if (!pricing || typeof pricing.input !== "number" || typeof pricing.output !== "number") return null;
  if (!Number.isFinite(pricing.input) || !Number.isFinite(pricing.output)) return null;
  const cacheRaw = pricing.cacheHit;
  if (cacheRaw != null && !Number.isFinite(cacheRaw)) return null;
  const cacheWriteRaw = pricing.cacheWrite;
  if (cacheWriteRaw != null && !Number.isFinite(cacheWriteRaw)) return null;
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  const hitRate = clamp01(opts?.cacheHitRate ?? 0);
  // The write tier exists only when the upstream interface reports a write price.
  const hasWriteTier = typeof cacheWriteRaw === "number";
  const writeRate = hasWriteTier ? clamp01(Math.min(opts?.cacheWriteRate ?? 0, 1 - hitRate)) : 0;
  const freshRate = 1 - hitRate - writeRate;
  const cached = typeof cacheRaw === "number" ? cacheRaw : pricing.input;
  const writeLeg = hasWriteTier ? writeRate * cacheWriteRaw! : 0;
  const inputRate = hitRate * cached + writeLeg + freshRate * pricing.input;
  const reasoning = nonNeg(opts?.reasoningTokens ?? 0);
  return (
    (nonNeg(promptTokens) / 1_000_000) * inputRate +
    ((nonNeg(completionTokens) + reasoning) / 1_000_000) * pricing.output
  );
}

interface MonthlyCostOptions {
  dailyInput: number;
  dailyOutput: number;
  dailyReasoning?: number;
  cacheHitRate: number;
  cacheWriteRate: number;
  daysPerMonth: number;
}

export function calcMonthlyCost(
  model: ArtificialAnalysisModel,
  opts: MonthlyCostOptions,
  official?: OfficialPriceModel | null,
): number | null {
  const pricing = official ? resolveEffectivePricing(model.pricing, official) : model.pricing;
  const daily = calcCost(pricing, opts.dailyInput, opts.dailyOutput, {
    cacheHitRate: opts.cacheHitRate,
    cacheWriteRate: opts.cacheWriteRate,
    reasoningTokens: opts.dailyReasoning,
  });
  return daily == null ? null : daily * Math.max(1, opts.daysPerMonth);
}

export function getOutputSpeed(model: ArtificialAnalysisModel): number | null {
  return model.speed?.median_output_speed ?? null;
}

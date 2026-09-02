import { resolveEffectivePricing } from "@/client/utils/pricing-merge";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";

interface CostEstimateOptions {
  cacheHitRate?: number;
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
  if (cacheRaw !== undefined && cacheRaw !== null && !Number.isFinite(cacheRaw)) return null;
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  const hitRate = clamp01(opts?.cacheHitRate ?? 0);
  const cached = typeof cacheRaw === "number" ? cacheRaw : pricing.input;
  const inputRate = (1 - hitRate) * pricing.input + hitRate * cached;
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
    reasoningTokens: opts.dailyReasoning,
  });
  return daily == null ? null : daily * Math.max(1, opts.daysPerMonth);
}

export function getOutputSpeed(model: ArtificialAnalysisModel): number | null {
  return model.speed?.median_output_speed ?? null;
}

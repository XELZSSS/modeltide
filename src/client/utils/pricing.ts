import { isFiniteNumber } from "@/shared/utils";
import type { ModelPricing } from "@/shared/types";

export interface EffectivePricing {
  input: number | null;
  output: number | null;
  cacheHit: number | null;
  cacheWrite: number | null;
}

interface PriceLegFields {
  input: number | null;
  output: number | null;
  cacheHit?: number | null;
  cacheWrite?: number | null;
}

export type PriceLegId = "promptPrice" | "completionPrice" | "cacheHitPrice" | "cacheWritePrice";

export type PriceLegPick = (pricing: PriceLegFields) => number | null | undefined;

export const PRICE_LEGS = {
  promptPrice: (p) => p.input,
  completionPrice: (p) => p.output,
  cacheHitPrice: (p) => p.cacheHit,
  cacheWritePrice: (p) => p.cacheWrite,
} as const satisfies Record<PriceLegId, PriceLegPick>;

const finiteOrNull = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

export function resolveEffectivePricing(pricing: ModelPricing | undefined): EffectivePricing {
  return {
    input: finiteOrNull(pricing?.input),
    output: finiteOrNull(pricing?.output),
    cacheHit: finiteOrNull(pricing?.cacheHit),
    cacheWrite: finiteOrNull(pricing?.cacheWrite),
  };
}

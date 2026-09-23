import { isFiniteNumber } from "@/shared/utils";
import type { ModelPricing } from "@/shared/types";

export interface EffectivePricing {
  input: number | null;
  output: number | null;
  cacheHit: number | null;
  cacheWrite: number | null;
}

/** The four priced fields a leg reads; an OpenRouter entry's pricing block also satisfies it. */
interface PriceLegFields {
  input: number | null;
  output: number | null;
  cacheHit?: number | null;
  cacheWrite?: number | null;
}

export type PriceLegId = "promptPrice" | "completionPrice" | "cacheHitPrice" | "cacheWritePrice";

export type PriceLegPick = (pricing: PriceLegFields) => number | null | undefined;

/** The single mapping of price leg to backing field; the id doubles as the i18n key at call sites. */
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

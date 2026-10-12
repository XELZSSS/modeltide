import { isFiniteNumber } from "@/shared/utils/numbers";
import type { ModelPricing } from "@/shared/types/catalog";
import type { TranslationKey } from "@/shared/i18n";

export type EffectivePricing = { [K in keyof ModelPricing]: number | null };

export type PriceLegId = "promptPrice" | "completionPrice" | "cacheHitPrice" | "cacheWritePrice";

export type PriceLegPick = (pricing: ModelPricing) => number | null | undefined;

export const PRICE_LEGS = {
  promptPrice: (p) => p.input,
  completionPrice: (p) => p.output,
  cacheHitPrice: (p) => p.cacheHit,
  cacheWritePrice: (p) => p.cacheWrite,
} as const satisfies Record<PriceLegId, PriceLegPick>;

export const PRICE_LEG_IDS = [
  "promptPrice",
  "completionPrice",
  "cacheHitPrice",
  "cacheWritePrice",
] as const satisfies readonly TranslationKey[];

const finiteOrNull = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

export function resolveEffectivePricing(pricing: ModelPricing | null | undefined): EffectivePricing {
  return {
    input: finiteOrNull(pricing?.input),
    output: finiteOrNull(pricing?.output),
    cacheHit: finiteOrNull(pricing?.cacheHit),
    cacheWrite: finiteOrNull(pricing?.cacheWrite),
  };
}

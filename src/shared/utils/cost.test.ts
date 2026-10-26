import { describe, expect, it } from "vitest";
import { modelPricing } from "@/test/fixtures";
import { estimateCost, type CostScenario } from "./cost";
import type { ModelPricing } from "@/shared/types/catalog";

const scenario = (fields: Partial<CostScenario> = {}): CostScenario => ({
  dailyInputM: 2,
  dailyOutputM: 1,
  dailyReasoningM: 2,
  cacheHitRate: 0.5,
  cacheWriteRate: 0.1,
  daysPerMonth: 22,
  ...fields,
});

const monthlyOf = (pricing: ModelPricing | null = modelPricing(), fields: Partial<CostScenario> = {}) =>
  estimateCost(pricing, scenario(fields))?.monthlyCost ?? null;

const blendedOf = (pricing: ModelPricing | null = modelPricing(), fields: Partial<CostScenario> = {}) =>
  estimateCost(pricing, scenario(fields))?.blendedPrice ?? null;

const MONTHLY_CASES: ReadonlyArray<[title: string, pricing: ModelPricing, expected: number]> = [
  ["mixes the cache tiers, the write tier and the uncached remainder", modelPricing(), 292.6],
  [
    "falls back to the input rate when there is no cache-hit leg",
    modelPricing({ cacheHit: null, cacheWrite: null }),
    308,
  ],
  ["ignores a write rate when the model has no cache-write leg", modelPricing({ cacheWrite: null }), 13.25 * 22],
];

describe("estimateCost", () => {
  it.each(MONTHLY_CASES)("%s", (_title, pricing, expected) => {
    expect(monthlyOf(pricing)).toBeCloseTo(expected, 6);
  });

  it.each<[title: string, pricing: ModelPricing | null]>([
    ["a null pricing object", null],
    ["a missing input leg", modelPricing({ input: null })],
    ["a missing output leg", modelPricing({ output: null })],
  ])("returns no estimate for %s", (_title, pricing) => {
    expect(estimateCost(pricing, scenario())).toBeNull();
    expect(blendedOf(pricing)).toBeNull();
  });

  it("clamps the write rate so hit and write cannot exceed the input volume", () => {
    const monthly = monthlyOf(modelPricing(), { cacheHitRate: 0.8, cacheWriteRate: 0.9 });
    expect(monthly).toBeCloseTo((2 * 0.45 + 3 * 4) * 22, 6);
  });

  it("counts at least one day per month", () => {
    expect(monthlyOf(modelPricing(), { daysPerMonth: 0 })).toBeCloseTo(13.3, 6);
  });

  it("never charges for a negative daily volume", () => {
    const monthly = monthlyOf(modelPricing(), { dailyInputM: -5, cacheHitRate: 0, cacheWriteRate: 0 });
    expect(monthly).toBeCloseTo(3 * 4 * 22, 6);
  });

  it("returns null when the result is not finite", () => {
    expect(estimateCost(modelPricing({ output: Number.MAX_VALUE }), scenario())?.monthlyCost).toBeNull();
  });

  it("derives the blended price from the same numbers as the monthly cost", () => {
    const estimate = estimateCost(modelPricing(), scenario())!;
    expect(estimate.blendedPrice).toBeCloseTo(2.66, 6);
    // The invariant the two displayed figures are read against.
    expect(estimate.blendedPrice! * estimate.dailyTokensM * scenario().daysPerMonth).toBeCloseTo(
      estimate.monthlyCost!,
      6,
    );
  });

  it("charges the cache-write leg in both figures", () => {
    const withWrites = estimateCost(modelPricing(), scenario({ cacheWriteRate: 0.2 }))!;
    const without = estimateCost(modelPricing(), scenario({ cacheWriteRate: 0 }))!;
    expect(withWrites.monthlyCost!).toBeGreaterThan(without.monthlyCost!);
    expect(withWrites.blendedPrice!).toBeGreaterThan(without.blendedPrice!);
    expect(withWrites.blendedPrice! * withWrites.dailyTokensM * scenario().daysPerMonth).toBeCloseTo(
      withWrites.monthlyCost!,
      6,
    );
  });

  it("substitutes the input rate for a missing cache-hit leg in the blended price too", () => {
    expect(blendedOf(modelPricing({ cacheHit: null, cacheWrite: null }))).toBeCloseTo(14 / 5, 6);
  });

  it("has no blended price when the scenario has no volume, while the monthly cost is zero", () => {
    const estimate = estimateCost(modelPricing(), scenario({ dailyInputM: 0, dailyOutputM: 0, dailyReasoningM: 0 }))!;
    expect(estimate.monthlyCost).toBe(0);
    expect(estimate.blendedPrice).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { modelPricing } from "@/test/fixtures";
import { estimateCost, type CostScenario } from "./cost";

const scenario = (fields: Partial<CostScenario> = {}): CostScenario => ({
  dailyInputM: 2,
  dailyOutputM: 1,
  dailyReasoningM: 2,
  cacheHitRate: 0.5,
  cacheWriteRate: 0.1,
  daysPerMonth: 22,
  ...fields,
});

const monthlyOf = (pricing = modelPricing(), fields: Partial<CostScenario> = {}) =>
  estimateCost(pricing, scenario(fields))?.monthlyCost ?? null;

const blendedOf = (pricing = modelPricing(), fields: Partial<CostScenario> = {}) =>
  estimateCost(pricing, scenario(fields))?.blendedPrice ?? null;

describe("estimateCost", () => {
  it("returns null when the pricing legs the estimate needs are missing", () => {
    expect(estimateCost(null, scenario())).toBeNull();
    expect(estimateCost(modelPricing({ input: null }), scenario())).toBeNull();
    expect(estimateCost(modelPricing({ output: null }), scenario())).toBeNull();
  });

  it("mixes the cache tiers, the write tier and the uncached remainder", () => {
    expect(monthlyOf()).toBeCloseTo(292.6, 6);
  });

  it("falls back to the input rate when there is no cache-hit leg", () => {
    const pricing = modelPricing({ cacheHit: null, cacheWrite: null });
    expect(monthlyOf(pricing)).toBeCloseTo(308, 6);
  });

  it("ignores a write rate when the model has no cache-write leg", () => {
    const pricing = modelPricing({ cacheWrite: null });
    expect(monthlyOf(pricing)).toBeCloseTo(13.25 * 22, 6);
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
    expect(estimate.monthlyCost).toBeCloseTo(292.6, 6);
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

  it("returns null weights without the two required legs", () => {
    expect(blendedOf(null as never)).toBeNull();
  });
});

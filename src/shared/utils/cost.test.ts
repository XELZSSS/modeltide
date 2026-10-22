import { describe, expect, it } from "vitest";
import { modelPricing } from "@/test/fixtures";
import { computeBlendPrice, monthlyCostFor, type CostScenario } from "./cost";

const scenario = (fields: Partial<CostScenario> = {}): CostScenario => ({
  dailyInputM: 2,
  dailyOutputM: 1,
  dailyReasoningM: 2,
  cacheHitRate: 0.5,
  cacheWriteRate: 0.1,
  daysPerMonth: 22,
  ...fields,
});

describe("monthlyCostFor", () => {
  it("returns null when the pricing legs the estimate needs are missing", () => {
    expect(monthlyCostFor(null, scenario())).toBeNull();
    expect(monthlyCostFor(modelPricing({ input: null }), scenario())).toBeNull();
    expect(monthlyCostFor(modelPricing({ output: null }), scenario())).toBeNull();
  });

  it("mixes the cache tiers, the write tier and the uncached remainder", () => {
    expect(monthlyCostFor(modelPricing(), scenario())).toBeCloseTo(292.6, 6);
  });

  it("falls back to the input rate when there is no cache-hit leg", () => {
    const pricing = modelPricing({ cacheHit: null, cacheWrite: null });
    expect(monthlyCostFor(pricing, scenario())).toBeCloseTo(308, 6);
  });

  it("ignores a write rate when the model has no cache-write leg", () => {
    const pricing = modelPricing({ cacheWrite: null });
    expect(monthlyCostFor(pricing, scenario())).toBeCloseTo(13.25 * 22, 6);
  });

  it("clamps the write rate so hit and write cannot exceed the input volume", () => {
    const pricing = modelPricing();
    const monthly = monthlyCostFor(
      pricing,
      scenario({ cacheHitRate: 0.8, cacheWriteRate: 0.9, dailyOutputM: 1, dailyReasoningM: 2 }),
    );
    expect(monthly).toBeCloseTo((2 * 0.45 + 3 * 4) * 22, 6);
  });

  it("counts at least one day per month", () => {
    expect(monthlyCostFor(modelPricing(), scenario({ daysPerMonth: 0 }))).toBeCloseTo(13.3, 6);
  });

  it("never charges for a negative daily volume", () => {
    const monthly = monthlyCostFor(modelPricing(), scenario({ dailyInputM: -5, cacheHitRate: 0, cacheWriteRate: 0 }));
    expect(monthly).toBeCloseTo(3 * 4 * 22, 6);
  });

  it("returns null when the result is not finite", () => {
    expect(monthlyCostFor(modelPricing({ output: Number.MAX_VALUE }), scenario())).toBeNull();
  });
});

describe("computeBlendPrice", () => {
  it("weights cache 70%, input 20% and output 10%", () => {
    expect(computeBlendPrice(modelPricing())).toBeCloseTo(0.775, 6);
  });

  it("substitutes the input rate when there is no cache-hit leg", () => {
    expect(computeBlendPrice(modelPricing({ cacheHit: null }))).toBeCloseTo((7 * 1 + 2 * 1 + 4) / 10, 6);
  });

  it("returns null without the two required legs", () => {
    expect(computeBlendPrice(null)).toBeNull();
    expect(computeBlendPrice(modelPricing({ output: null }))).toBeNull();
  });
});

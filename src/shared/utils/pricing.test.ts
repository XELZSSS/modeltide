import { describe, expect, it } from "vitest";
import { modelPricing } from "@/test/fixtures";
import { PRICE_LEG_IDS, PRICE_LEGS, resolveEffectivePricing } from "./pricing";

describe("resolveEffectivePricing", () => {
  it("passes finite legs through unchanged", () => {
    expect(resolveEffectivePricing(modelPricing())).toEqual({
      input: 1,
      output: 4,
      cacheHit: 0.25,
      cacheWrite: 1.25,
    });
  });

  it("normalises every unusable leg to null", () => {
    const resolved = resolveEffectivePricing({
      input: Number.NaN,
      output: Number.POSITIVE_INFINITY,
      cacheHit: null,
      cacheWrite: undefined as unknown as null,
    });
    expect(resolved).toEqual({ input: null, output: null, cacheHit: null, cacheWrite: null });
  });

  it("returns all nulls for a model without pricing", () => {
    expect(resolveEffectivePricing(null)).toEqual({ input: null, output: null, cacheHit: null, cacheWrite: null });
    expect(resolveEffectivePricing(undefined)).toEqual({ input: null, output: null, cacheHit: null, cacheWrite: null });
  });
});

describe("PRICE_LEGS", () => {
  const pricing = modelPricing();

  it("maps each leg id onto its pricing field", () => {
    expect(PRICE_LEGS.promptPrice(pricing)).toBe(pricing.input);
    expect(PRICE_LEGS.completionPrice(pricing)).toBe(pricing.output);
    expect(PRICE_LEGS.cacheHitPrice(pricing)).toBe(pricing.cacheHit);
    expect(PRICE_LEGS.cacheWritePrice(pricing)).toBe(pricing.cacheWrite);
  });

  it("keeps the id list in display order and in step with the leg map", () => {
    expect(PRICE_LEG_IDS).toEqual(["promptPrice", "completionPrice", "cacheHitPrice", "cacheWritePrice"]);
    expect([...PRICE_LEG_IDS]).toEqual(Object.keys(PRICE_LEGS));
  });
});

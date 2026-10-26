import { describe, expect, it } from "vitest";
import { modelPricing } from "@/test/fixtures";
import { PRICE_LEG_IDS, PRICE_LEGS, resolveEffectivePricing } from "./pricing";

/** What every unusable or absent leg resolves to. */
const ALL_NULL_PRICING = { input: null, output: null, cacheHit: null, cacheWrite: null };

/** Each leg id and the pricing field it reads, so the map and its ids stay in step. */
const LEG_FIELDS = [
  ["promptPrice", "input"],
  ["completionPrice", "output"],
  ["cacheHitPrice", "cacheHit"],
  ["cacheWritePrice", "cacheWrite"],
] as const;

const UNUSABLE_LEGS = {
  input: Number.NaN,
  output: Number.POSITIVE_INFINITY,
  cacheHit: null,
  cacheWrite: undefined as unknown as null,
};

describe("resolveEffectivePricing", () => {
  it("passes finite legs through unchanged", () => {
    expect(resolveEffectivePricing(modelPricing())).toEqual({
      input: 1,
      output: 4,
      cacheHit: 0.25,
      cacheWrite: 1.25,
    });
  });

  it.each([UNUSABLE_LEGS, null, undefined])("normalises the unusable or absent pricing %s to nulls", (pricing) => {
    expect(resolveEffectivePricing(pricing)).toEqual(ALL_NULL_PRICING);
  });
});

describe("PRICE_LEGS", () => {
  const pricing = modelPricing();

  it.each(LEG_FIELDS)("%s maps onto the %s pricing field", (leg, field) => {
    expect(PRICE_LEGS[leg](pricing)).toBe(pricing[field]);
  });

  it("keeps the id list in display order and in step with the leg map", () => {
    expect(PRICE_LEG_IDS).toEqual(["promptPrice", "completionPrice", "cacheHitPrice", "cacheWritePrice"]);
    expect([...PRICE_LEG_IDS]).toEqual(Object.keys(PRICE_LEGS));
  });
});

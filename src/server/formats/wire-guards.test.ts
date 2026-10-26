import { describe, expect, it } from "vitest";
import { isModelRow, isPricingRow } from "./wire-guards";

describe("isModelRow", () => {
  it("accepts a row whose permaslug is a string", () => {
    expect(isModelRow({ model_permaslug: "openai/gpt-6-1-sol-20260922" })).toBe(true);
  });

  it("rejects anything the aggregator could not group", () => {
    expect(isModelRow({})).toBe(false);
    expect(isModelRow({ model_permaslug: 42 })).toBe(false);
    expect(isModelRow(null)).toBe(false);
    expect(isModelRow("openai/gpt-6-1-sol-20260922")).toBe(false);
  });

  it("does not require the numeric fields, which are read through numCoerce", () => {
    expect(isModelRow({ model_permaslug: "a/b", total_prompt_tokens: null })).toBe(true);
  });
});

describe("isPricingRow", () => {
  it("accepts a directory row with an id and a pricing object", () => {
    expect(isPricingRow({ id: "openai/gpt-6-1-sol-20260922", pricing: {} })).toBe(true);
  });

  it("rejects rows without usable pricing", () => {
    expect(isPricingRow({ id: "openai/gpt-6-1-sol-20260922" })).toBe(false);
    expect(isPricingRow({ id: "openai/gpt-6-1-sol-20260922", pricing: null })).toBe(false);
    expect(isPricingRow({ pricing: {} })).toBe(false);
    expect(isPricingRow([])).toBe(false);
  });
});

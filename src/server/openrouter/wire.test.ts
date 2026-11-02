import { describe, expect, it } from "vitest";
import { isOrDirectoryRow, isOrRankingRow } from "./wire";

describe("isOrRankingRow", () => {
  it("accepts a row whose permaslug is a string", () => {
    expect(isOrRankingRow({ model_permaslug: "openai/gpt-6-1-sol-20260922" })).toBe(true);
  });

  it("rejects anything the aggregator could not group", () => {
    expect(isOrRankingRow({})).toBe(false);
    expect(isOrRankingRow({ model_permaslug: 42 })).toBe(false);
    expect(isOrRankingRow(null)).toBe(false);
    expect(isOrRankingRow("openai/gpt-6-1-sol-20260922")).toBe(false);
  });

  it("does not require the numeric fields, which are read through numCoerce", () => {
    expect(isOrRankingRow({ model_permaslug: "a/b", total_prompt_tokens: null })).toBe(true);
  });
});

describe("isOrDirectoryRow", () => {
  it("accepts a directory row with an id and a pricing object", () => {
    expect(isOrDirectoryRow({ id: "openai/gpt-6-1-sol-20260922", pricing: {} })).toBe(true);
  });

  it("rejects rows without usable pricing", () => {
    expect(isOrDirectoryRow({ id: "openai/gpt-6-1-sol-20260922" })).toBe(false);
    expect(isOrDirectoryRow({ id: "openai/gpt-6-1-sol-20260922", pricing: null })).toBe(false);
    expect(isOrDirectoryRow({ pricing: {} })).toBe(false);
    expect(isOrDirectoryRow([])).toBe(false);
  });
});

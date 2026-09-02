import { describe, expect, it } from "vitest";
import { matchTerm } from "./useSearchAllRankings";

// Tests for the search term matching/scoring used across list views.

describe("matchTerm", () => {
  it("scores exact matches highest", () => {
    const { matched, score } = matchTerm(["gpt-5"], "gpt-5");
    expect(matched).toBe(true);
    expect(score).toBe(4);
  });

  it("scores prefix matches above substring matches", () => {
    expect(matchTerm(["gpt-5", "claude"], "gpt").score).toBe(3);
    expect(matchTerm(["my-gpt-5", "claude"], "gpt").score).toBe(2);
  });

  it("matches any field", () => {
    expect(matchTerm(["openai", "gpt-5-mini"], "mini").matched).toBe(true);
  });

  it("returns unmatched for empty fields", () => {
    expect(matchTerm(["", " "], "gpt").matched).toBe(false);
  });

  it("requires a non-empty term to match", () => {
    expect(matchTerm(["gpt-5"], "zzz").matched).toBe(false);
  });
});

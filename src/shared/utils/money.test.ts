import { describe, expect, it } from "vitest";
import { formatDollar, formatPricePerMillion } from "./money";

describe("formatDollar", () => {
  it("falls back for missing or non-finite values", () => {
    expect(formatDollar(null)).toBe("N/A");
    expect(formatDollar(undefined)).toBe("N/A");
    expect(formatDollar(Number.NaN)).toBe("N/A");
    expect(formatDollar(Number.POSITIVE_INFINITY)).toBe("N/A");
  });

  it("formats ordinary amounts with two decimals", () => {
    expect(formatDollar(0)).toBe("$0.00");
    expect(formatDollar(1.5)).toBe("$1.50");
    expect(formatDollar(1234.567)).toBe("$1234.57");
  });

  it("adds decimals instead of collapsing a small price to zero", () => {
    expect(formatDollar(0.004)).toBe("$0.004");
    expect(formatDollar(0.0004)).toBe("$0.0004");
  });

  it("keeps the comparison operator outside the sign for tiny magnitudes", () => {
    expect(formatDollar(0.00001)).toBe("<$0.0001");
    expect(formatDollar(-0.00001)).toBe(">-$0.0001");
  });

  it("keeps the sign on ordinary negative amounts", () => {
    expect(formatDollar(-2.5)).toBe("-$2.50");
  });
});

describe("formatPricePerMillion", () => {
  it("appends the per-million suffix", () => {
    expect(formatPricePerMillion(2)).toBe("$2.00/M tokens");
  });

  it("falls back for missing values", () => {
    expect(formatPricePerMillion(null)).toBe("N/A");
  });
});

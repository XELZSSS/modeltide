import { describe, expect, it } from "vitest";
import { t } from "@/test/fixtures";
import {
  approxEq,
  formatIndex,
  formatShortNumber,
  formatSpeed,
  formatTokens,
  formatTrend,
  isFiniteNumber,
  ratioToPercent,
} from "./number";

describe("isFiniteNumber", () => {
  it.each([
    [1, true],
    [0, true],
    [-1.5, true],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ["1", false],
    [null, false],
  ])("%s -> %s", (value, expected) => {
    expect(isFiniteNumber(value)).toBe(expected);
  });
});

describe("ratioToPercent", () => {
  it("scales a 0-1 ratio onto a percent scale", () => {
    expect(ratioToPercent(0)).toBe(0);
    expect(ratioToPercent(0.5)).toBe(50);
    expect(ratioToPercent(1)).toBe(100);
  });

  it("drops values outside 0-1 instead of guessing a scale", () => {
    expect(ratioToPercent(1.5)).toBeNull();
    expect(ratioToPercent(42)).toBeNull();
    expect(ratioToPercent(-0.5)).toBeNull();
    expect(ratioToPercent(null)).toBeNull();
    expect(ratioToPercent(Number.NaN)).toBeNull();
  });
});

describe("approxEq", () => {
  it("tolerates floating point noise but not real differences", () => {
    expect(approxEq(0.1 + 0.2, 0.3)).toBe(true);
    expect(approxEq(1, 2)).toBe(false);
    expect(approxEq(0, 1e-12)).toBe(true);
  });
});

describe("formatShortNumber", () => {
  it.each([
    [0, "0"],
    [2, "2"],
    [2.345, "2.35"],
    [1200, "1.20K"],
    [1_500_000, "1.50M"],
    [-1200, "-1.20K"],
  ])("%s -> %s", (value, expected) => {
    expect(formatShortNumber(value)).toBe(expected);
  });

  it("falls back for a missing or non-finite value", () => {
    expect(formatShortNumber(null)).toBe("—");
    expect(formatShortNumber(Number.NaN)).toBe("—");
  });
});

describe("formatTokens", () => {
  it("uses one decimal and drops a trailing .0", () => {
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(2000)).toBe("2K");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });

  it("leaves small values as plain integers", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("falls back through the translator", () => {
    expect(formatTokens(null, t)).toBe("notAvailable");
  });
});

describe("formatTrend", () => {
  it("prefixes a rise with a plus and never for a fall", () => {
    expect(formatTrend(2.5)).toBe("+2.5%");
    expect(formatTrend(-1)).toBe("-1.0%");
    expect(formatTrend(0)).toBe("0.0%");
  });

  it("falls back for a missing value", () => {
    expect(formatTrend(null, t)).toBe("notAvailable");
  });
});

describe("formatIndex / formatSpeed", () => {
  it("groups thousands with at most one decimal", () => {
    expect(formatIndex(1234.56)).toBe("1,234.6");
  });

  it("falls back for a non-finite input", () => {
    expect(formatIndex(Number.NaN)).toBe("—");
    expect(formatSpeed(null, t)).toBe("notAvailable");
  });
});

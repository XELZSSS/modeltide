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
  // Out-of-range ratios are dropped rather than rescaled by a guess.
  it.each([
    [0, 0],
    [0.5, 50],
    [1, 100],
    [1.5, null],
    [42, null],
    [-0.5, null],
    [null, null],
    [Number.NaN, null],
  ])("scales %s onto %s", (ratio, expected) => {
    expect(ratioToPercent(ratio)).toBe(expected);
  });
});

describe("approxEq", () => {
  it.each([
    [0.1 + 0.2, 0.3, true],
    [1, 2, false],
    [0, 1e-12, true],
  ])("compares %s with %s as %s", (a, b, expected) => {
    expect(approxEq(a, b)).toBe(expected);
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
    // Missing or non-finite input falls back to the dash.
    [null, "—"],
    [Number.NaN, "—"],
  ])("%s -> %s", (value, expected) => {
    expect(formatShortNumber(value)).toBe(expected);
  });
});

describe("formatTokens", () => {
  it.each([
    [1500, "1.5K"],
    [2000, "2K"],
    [1_500_000, "1.5M"],
    [500, "500"],
  ])("uses one decimal, dropping a trailing .0: %s -> %s", (tokens, expected) => {
    expect(formatTokens(tokens)).toBe(expected);
  });

  it("falls back through the translator", () => {
    expect(formatTokens(null, t)).toBe("notAvailable");
  });
});

describe("formatTrend", () => {
  it.each([
    [2.5, "+2.5%"],
    [-1, "-1.0%"],
    [0, "0.0%"],
  ])("formats the trend %s as %s", (change, expected) => {
    expect(formatTrend(change)).toBe(expected);
  });

  it("falls back for a missing value", () => {
    expect(formatTrend(null, t)).toBe("notAvailable");
  });
});

describe("formatIndex / formatSpeed", () => {
  it.each([
    [1234.56, "1,234.6"],
    [Number.NaN, "—"],
  ])("groups thousands with at most one decimal: %s -> %s", (value, expected) => {
    expect(formatIndex(value)).toBe(expected);
  });

  it("falls back for a non-finite speed", () => {
    expect(formatSpeed(null, t)).toBe("notAvailable");
  });
});

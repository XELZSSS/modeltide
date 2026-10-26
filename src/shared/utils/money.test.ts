import { describe, expect, it } from "vitest";
import { formatDollar, formatPricePerMillion } from "./money";

describe("formatDollar", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])("falls back for %s", (value) => {
    expect(formatDollar(value)).toBe("N/A");
  });

  it.each([
    [0, "$0.00"],
    [1.5, "$1.50"],
    [1234.567, "$1234.57"],
  ])("formats the ordinary amount %s as %s", (value, expected) => {
    expect(formatDollar(value)).toBe(expected);
  });

  it.each([
    [0.004, "$0.004"],
    [0.0004, "$0.0004"],
  ])("adds decimals instead of collapsing %s to zero: %s", (value, expected) => {
    expect(formatDollar(value)).toBe(expected);
  });

  it.each([
    [0.00001, "<$0.0001"],
    [-0.00001, ">-$0.0001"],
  ])("keeps the comparison operator outside the sign for %s -> %s", (value, expected) => {
    expect(formatDollar(value)).toBe(expected);
  });

  it("keeps the sign on ordinary negative amounts", () => {
    expect(formatDollar(-2.5)).toBe("-$2.50");
  });
});

describe("formatPricePerMillion", () => {
  it.each([
    [2, "$2.00/M tokens"],
    [null, "N/A"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatPricePerMillion(value)).toBe(expected);
  });
});

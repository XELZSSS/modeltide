import { describe, expect, it } from "vitest";
import { isCostFieldInput } from "./cost-inputs";

const ACCEPTED = ["0", "12", "12.5", "12.", ".5"];

describe("isCostFieldInput", () => {
  it("accepts an empty field while the user is still typing", () => {
    expect(isCostFieldInput("")).toBe(true);
    expect(isCostFieldInput("   ")).toBe(true);
  });

  it.each(ACCEPTED)("accepts %s as an integer, a decimal or a trailing or leading point", (value) => {
    expect(isCostFieldInput(value)).toBe(true);
  });

  it("rejects a lone point, which Number() would turn into NaN and price as zero", () => {
    expect(isCostFieldInput(".")).toBe(false);
    expect(isCostFieldInput("1.2.3")).toBe(false);
    expect(isCostFieldInput("-1")).toBe(false);
    expect(isCostFieldInput("1e3")).toBe(false);
    expect(isCostFieldInput("abc")).toBe(false);
  });
});

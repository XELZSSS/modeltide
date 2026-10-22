import { describe, expect, it } from "vitest";
import { isCostFieldInput } from "./cost-inputs";

describe("isCostFieldInput", () => {
  it("accepts an empty field while the user is still typing", () => {
    expect(isCostFieldInput("")).toBe(true);
    expect(isCostFieldInput("   ")).toBe(true);
  });

  it("accepts integers, decimals and a trailing or leading point", () => {
    for (const value of ["0", "12", "12.5", "12.", ".5"]) {
      expect(isCostFieldInput(value)).toBe(true);
    }
  });

  it("rejects a lone point, which Number() would turn into NaN and price as zero", () => {
    expect(isCostFieldInput(".")).toBe(false);
    expect(isCostFieldInput("1.2.3")).toBe(false);
    expect(isCostFieldInput("-1")).toBe(false);
    expect(isCostFieldInput("1e3")).toBe(false);
    expect(isCostFieldInput("abc")).toBe(false);
  });
});

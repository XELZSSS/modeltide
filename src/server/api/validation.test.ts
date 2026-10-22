import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import { qEnum, qStr, validateQuery } from "./validation";

const SORTS = ["trendingScore", "downloads"] as const;

describe("validateQuery", () => {
  it("fills an enum default when the param is absent", () => {
    expect(validateQuery({}, { sort: qEnum(SORTS, "trendingScore") })).toEqual({ sort: "trendingScore" });
  });

  it("keeps an optional string absent instead of failing", () => {
    expect(validateQuery({}, { id: qStr({ optional: true }) })).toEqual({ id: undefined });
  });

  it("rejects a missing required string", () => {
    expect(() => validateQuery({}, { id: qStr() })).toThrow(ValidationError);
    expect(() => validateQuery({}, { id: qStr() })).toThrow(/"id" is required/);
  });

  it("rejects a required enum that has no default", () => {
    expect(() => validateQuery({}, { sort: qEnum(SORTS) })).toThrow(/is required/);
  });

  it("rejects a repeated param instead of quietly picking one", () => {
    expect(() => validateQuery({ id: ["a", "b"] }, { id: qStr() })).toThrow(/must not be repeated/);
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(() => validateQuery({ id: "   " }, { id: qStr() })).toThrow(/must not be empty/);
  });

  it("trims before validating", () => {
    expect(validateQuery({ id: "  abc  " }, { id: qStr() })).toEqual({ id: "abc" });
  });

  it("lists the accepted values when an enum value is unknown", () => {
    expect(() => validateQuery({ sort: "nope" }, { sort: qEnum(SORTS, "trendingScore") })).toThrow(
      /must be one of: trendingScore, downloads/,
    );
  });

  it("enforces the per-param length cap", () => {
    expect(() => validateQuery({ id: "abcdef" }, { id: qStr({ maxLength: 5 }) })).toThrow(/must be <= 5 chars/);
  });

  it("enforces the shared identifier cap for every spec type", () => {
    expect(() => validateQuery({ sort: "x".repeat(501) }, { sort: qEnum(SORTS) })).toThrow(/too long/);
    expect(() => validateQuery({ id: "x".repeat(501) }, { id: qStr() })).toThrow(/too long/);
  });

  it("returns only the declared params", () => {
    const raw = { sort: "downloads", id: "org/model" };
    expect(validateQuery(raw, { sort: qEnum(SORTS, "trendingScore") })).toEqual({ sort: "downloads" });
  });
});

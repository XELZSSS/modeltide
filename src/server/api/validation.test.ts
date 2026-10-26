import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import { qEnum, qStr, validateQuery, type QuerySchema } from "./validation";

const SORTS = ["trendingScore", "downloads"] as const;
/** One char past the shared identifier cap, so the spec-type-agnostic rejection fires. */
const TOO_LONG = "x".repeat(501);
const ID_SCHEMA: QuerySchema = { id: qStr() };
const SORT_SCHEMA: QuerySchema = { sort: qEnum(SORTS, "trendingScore") };
const REQUIRED_SORT_SCHEMA: QuerySchema = { sort: qEnum(SORTS) };

type RawQuery = Record<string, string | string[]>;
type AcceptedCase = [name: string, raw: RawQuery, schema: QuerySchema, answer: unknown];
type RejectedCase = [name: string, raw: RawQuery, schema: QuerySchema, message: RegExp];

const ACCEPTED_CASES: ReadonlyArray<AcceptedCase> = [
  ["absent enum param, defaulted", {}, SORT_SCHEMA, { sort: "trendingScore" }],
  ["absent optional string, left absent", {}, { id: qStr({ optional: true }) }, { id: undefined }],
  ["padded value, trimmed", { id: "  abc  " }, ID_SCHEMA, { id: "abc" }],
  ["undeclared params, dropped", { sort: "downloads", id: "org/model" }, SORT_SCHEMA, { sort: "downloads" }],
];

const REJECTED_CASES: ReadonlyArray<RejectedCase> = [
  ["required string, missing", {}, ID_SCHEMA, /"id" is required/],
  ["required enum without a default", {}, REQUIRED_SORT_SCHEMA, /is required/],
  ["repeated param", { id: ["a", "b"] }, ID_SCHEMA, /must not be repeated/],
  ["empty or whitespace-only value", { id: "   " }, ID_SCHEMA, /must not be empty/],
  ["unknown enum value", { sort: "nope" }, SORT_SCHEMA, /must be one of: trendingScore, downloads/],
  ["value over the per-param length cap", { id: "abcdef" }, { id: qStr({ maxLength: 5 }) }, /must be <= 5 chars/],
  ["enum value over the shared identifier cap", { sort: TOO_LONG }, REQUIRED_SORT_SCHEMA, /too long/],
  ["string value over the shared identifier cap", { id: TOO_LONG }, ID_SCHEMA, /too long/],
];

describe("validateQuery", () => {
  it.each(ACCEPTED_CASES)("accepts %s", (_name, raw, schema, answer) => {
    expect(validateQuery(raw, schema)).toEqual(answer);
  });

  it.each(REJECTED_CASES)("rejects %s", (_name, raw, schema, message) => {
    expect(() => validateQuery(raw, schema)).toThrow(message);
  });

  it("rejects with a ValidationError", () => {
    expect(() => validateQuery({}, ID_SCHEMA)).toThrow(ValidationError);
  });
});

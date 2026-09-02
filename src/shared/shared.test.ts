import { describe, expect, it } from "vitest";
import {
  normalizeModelLimit,
  sliceToLimit,
  ttlFor,
  ttlForRatio,
  DEFAULT_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  MAX_MODEL_LIMIT,
} from "@/shared/config";
import {
  dedupeBy,
  normalizePercent,
  approxEq,
  fnv1aHash,
  normalizeModelKey,
  matchTerm,
  computeBlendPrice,
} from "@/shared/utils";

describe("shared/config limits", () => {
  it("normalizes model limits to bounded buckets", () => {
    expect(normalizeModelLimit(NaN)).toBe(50);
    expect(normalizeModelLimit(1)).toBe(50);
    expect(normalizeModelLimit(50)).toBe(50);
    expect(normalizeModelLimit(51)).toBe(100);
    expect(normalizeModelLimit(500)).toBe(MAX_MODEL_LIMIT);
    expect(normalizeModelLimit(10_000)).toBe(MAX_MODEL_LIMIT);
  });
  it("slices to the requested limit within the max", () => {
    expect(sliceToLimit([1, 2, 3], 2)).toEqual([1, 2]);
    expect(sliceToLimit([1, 2, 3], 0)).toEqual([]);
    expect(sliceToLimit([1, 2, 3], 10_000)).toEqual([1, 2, 3]);
  });
  it("shortens TTL on partial failure", () => {
    expect(ttlFor(false)).toBe(DEFAULT_TTL_MS);
    expect(ttlFor(true)).toBe(PARTIAL_FAIL_TTL_MS);
  });
  it("shortens TTL on ratio fan-outs only at half-or-more failures", () => {
    expect(ttlForRatio(0, 6)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(1, 6)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(2, 6)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(3, 6)).toBe(PARTIAL_FAIL_TTL_MS);
    expect(ttlForRatio(5, 6)).toBe(PARTIAL_FAIL_TTL_MS);
    expect(ttlForRatio(0, 1)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(1, 1)).toBe(PARTIAL_FAIL_TTL_MS);
    expect(ttlForRatio(3, 0)).toBe(DEFAULT_TTL_MS);
  });
});

describe("shared/utils", () => {
  it("dedupes by key keeping first, dropping empty keys", () => {
    expect(dedupeBy([{ id: "a" }, { id: "a" }, { id: "" }, { id: "b" }], (x) => x.id).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("normalizes percents and clamps", () => {
    expect(normalizePercent(0.5)).toBe(50);
    expect(normalizePercent(2)).toBe(2);
    expect(normalizePercent(200)).toBe(100);
    expect(normalizePercent(-1)).toBe(0);
    expect(normalizePercent(NaN)).toBeNull();
  });
  it("compares approximately", () => {
    expect(approxEq(1, 1 + 1e-10)).toBe(true);
    expect(approxEq(1, 2)).toBe(false);
  });
  it("hashes stably and guards prototypes", () => {
    expect(fnv1aHash("abc")).toBe(fnv1aHash("abc"));
    expect(Object.hasOwn({ a: 1 }, "a")).toBe(true);
    expect(Object.hasOwn({}, "__proto__" as never)).toBe(false);
  });
  it("normalizes model keys keeping thinking variants distinct", () => {
    expect(normalizeModelKey("Kimi-K2-Thinking")).not.toBe(normalizeModelKey("Kimi-K2"));
    expect(normalizeModelKey("Claude Opus 4.5")).toBe(normalizeModelKey("claude-opus-4-5"));
  });
  it("matches search terms by exact/prefix/substring", () => {
    expect(matchTerm(["hello world"], "hello world").matched).toBe(true);
    expect(matchTerm(["hello world"], "nope").matched).toBe(false);
  });
  it("blends prices with cache fallback", () => {
    expect(computeBlendPrice({ input: 1, output: 2 })).toBeCloseTo((7 * 1 + 2 * 1 + 2) / 10);
    expect(computeBlendPrice({ input: null, output: 2 })).toBeNull();
  });
});

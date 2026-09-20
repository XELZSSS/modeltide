import { describe, expect, it } from "vitest";
import {
  normalizeModelLimit,
  sliceToLimit,
  ttlFor,
  ttlForRatio,
  DEFAULT_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  MAX_MODEL_LIMIT,
  SOURCE_LIMITS,
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
import { createT, interpolate } from "@/shared/i18n";

describe("shared/config limits", () => {
  it.each([
    [NaN, 50],
    [1, 50],
    [50, 50],
    [51, 100],
    [150, 200],
    [500, MAX_MODEL_LIMIT],
    [10_000, MAX_MODEL_LIMIT],
  ])("normalizeModelLimit(%s) -> %s", (input, expected) => {
    expect(normalizeModelLimit(input)).toBe(expected);
  });

  it.each([
    [[1, 2, 3], 2, [1, 2]],
    [[1, 2, 3], 0, []],
    [[1, 2, 3], 10_000, [1, 2, 3]],
  ])("sliceToLimit(%j, %s) -> %j", (rows, limit, expected) => {
    expect(sliceToLimit(rows as number[], limit)).toEqual(expected);
  });

  it("keeps every per-content fetch cap within the global max", () => {
    for (const [name, cap] of Object.entries(SOURCE_LIMITS)) {
      expect(Number.isInteger(cap) && cap > 0, name).toBe(true);
      expect(cap, name).toBeLessThanOrEqual(MAX_MODEL_LIMIT);
    }
  });

  it("shortens TTL on partial failure", () => {
    expect(ttlFor(false)).toBe(DEFAULT_TTL_MS);
    expect(ttlFor(true)).toBe(PARTIAL_FAIL_TTL_MS);
  });

  it.each([
    [0, 6, DEFAULT_TTL_MS],
    [1, 6, DEFAULT_TTL_MS],
    [2, 6, PARTIAL_FAIL_TTL_MS],
    [3, 6, PARTIAL_FAIL_TTL_MS],
    [5, 6, PARTIAL_FAIL_TTL_MS],
    [0, 1, DEFAULT_TTL_MS],
    [1, 1, PARTIAL_FAIL_TTL_MS],
    [3, 0, DEFAULT_TTL_MS],
  ])("ttlForRatio(%s, %s) shortens at 30%%-or-more failures", (failed, total, expected) => {
    expect(ttlForRatio(failed, total)).toBe(expected);
  });
});

describe("shared/utils", () => {
  it("dedupes by key keeping first, keeping empty keys", () => {
    expect(dedupeBy([{ id: "a" }, { id: "a" }, { id: "" }, { id: "b" }], (x) => x.id).map((x) => x.id)).toEqual([
      "a",
      "",
      "b",
    ]);
  });

  it.each([
    [0.5, 50],
    [2, 2],
    [200, 100],
    [-1, 0],
  ])("normalizePercent(%s) -> %s", (input, expected) => {
    expect(normalizePercent(input)).toBe(expected);
  });

  it("normalizePercent(NaN) -> null", () => {
    expect(normalizePercent(NaN)).toBeNull();
  });

  it.each([
    [1, 1 + 1e-10, true],
    [1, 2, false],
  ])("approxEq(%s, %s) -> %s", (a, b, expected) => {
    expect(approxEq(a, b)).toBe(expected);
  });

  it("hashes stably and guards prototypes", () => {
    expect(fnv1aHash("abc")).toBe(fnv1aHash("abc"));
    expect(Object.hasOwn({ a: 1 }, "a")).toBe(true);
    expect(Object.hasOwn({}, "__proto__" as never)).toBe(false);
  });

  it.each([
    ["DeepSeek V4 Pro 0813 (Reasoning, Max Effort)", "deepseekv4pro0813"],
    ["deepseek/deepseek-v4-pro-0813", "deepseekv4pro0813"],
    ["Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)", "claudeopus5"],
    ["claude-opus-5-xhigh", "claudeopus5"],
    ["Anthropic: Claude Opus 5", "claudeopus5"],
    ["Claude Opus 4.5", "claude-opus-4-5"],
  ])("normalizeModelKey(%s) collapses variants", (input, expected) => {
    expect(normalizeModelKey(input)).toBe(normalizeModelKey(expected));
  });

  it("keeps thinking variants and distinct models distinct", () => {
    expect(normalizeModelKey("Kimi-K2-Thinking")).not.toBe(normalizeModelKey("Kimi-K2"));
    expect(normalizeModelKey("GLM-5.3 (max)")).not.toBe(normalizeModelKey("GLM-5.3-Flash"));
    expect(normalizeModelKey("GPT-5.6 Terra (max)")).not.toBe(normalizeModelKey("GPT-5.6 Luna (max)"));
  });

  it.each([
    [["gpt-5"], "gpt-5", true, 4],
    [["gpt-5", "claude"], "gpt", true, 3],
    [["my-gpt-5", "claude"], "gpt", true, 2],
    [["openai", "gpt-5-mini"], "mini", true, undefined],
    [["", " "], "gpt", false, undefined],
    [["gpt-5"], "zzz", false, undefined],
  ])("matchTerm(%j, %s)", (fields, term, matched, score) => {
    const res = matchTerm(fields as string[], term);
    expect(res.matched).toBe(matched);
    if (score !== undefined) expect(res.score).toBe(score);
  });

  it.each([
    [{ input: 5, output: 25, cacheHit: 0.5 }, 3.85],
    [{ input: 1.4, output: 4.4, cacheHit: 0.26 }, 0.902],
  ])("computeBlendPrice(%j) blends 7:2:1", (pricing, expected) => {
    expect(computeBlendPrice(pricing)).toBeCloseTo(expected, 5);
  });

  it.each([[{ input: 2, output: 6 }], [{ input: 2, output: 6, cacheHit: null }]])(
    "computeBlendPrice(%j) falls back to input price",
    (pricing) => {
      expect(computeBlendPrice(pricing)).toBe(2.4);
    },
  );

  it.each([{}, { input: 1 }, null])("computeBlendPrice(%j) returns null when legs missing", (pricing) => {
    expect(computeBlendPrice(pricing as never)).toBeNull();
  });
});

describe("shared/i18n", () => {
  it.each([
    ["{value} min ago", { value: 5 }, "5 min ago"],
    ["{a} + {b}", { a: 1, b: "x" }, "1 + x"],
    ["hello {name}", undefined, "hello {name}"],
    ["hello {name}", { name: null }, "hello {name}"],
  ])("interpolate(%s) keeps missing placeholders verbatim", (template, params, expected) => {
    expect(interpolate(template, params as never)).toBe(expected);
  });

  it("translates with the requested language and falls back to the key", () => {
    expect(createT("zh")("compareLimit")).toBe("请至少选择 2 个模型进行对比。");
    expect(createT("en")("compareLimit")).toBe("Select at least 2 models to compare.");
    expect(createT("en")("timeMinutesAgo", { value: 3 })).toMatch(/^3/);
    expect(createT("zh")("definitelyNotAKey" as never)).toBe("definitelyNotAKey");
  });
});

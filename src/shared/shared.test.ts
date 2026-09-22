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
import { en } from "@/shared/i18n/en";
import { zh } from "@/shared/i18n/zh";

describe("shared/config limits", () => {
  it.each([
    [NaN, 50],
    [50, 50],
    [51, 100],
    [500, MAX_MODEL_LIMIT],
  ])("normalizeModelLimit(%s) -> %s", (input, expected) => {
    expect(normalizeModelLimit(input)).toBe(expected);
  });

  it.each([
    [[1, 2, 3], 2, [1, 2]],
    [[1, 2, 3], 0, []],
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
    [2, 6, PARTIAL_FAIL_TTL_MS],
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
    [-1, 0],
    [NaN, null],
  ])("normalizePercent(%s) -> %s", (input, expected) => {
    expect(normalizePercent(input)).toBe(expected);
  });

  it("approxEq tolerates float noise", () => {
    expect(approxEq(1, 1 + 1e-10)).toBe(true);
  });

  it("hashes stably and guards prototypes", () => {
    expect(fnv1aHash("abc")).toBe(fnv1aHash("abc"));
    expect(Object.hasOwn({ a: 1 }, "a")).toBe(true);
    expect(Object.hasOwn({}, "__proto__" as never)).toBe(false);
  });

  it.each([
    ["DeepSeek V4 Pro 0813 (Reasoning, Max Effort)", "deepseekv4pro0813"],
    ["Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)", "claudeopus5"],
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
    [["", " "], "gpt", false, undefined],
    [["gpt-5"], "zzz", false, undefined],
  ])("matchTerm(%j, %s)", (fields, term, matched, score) => {
    const res = matchTerm(fields as string[], term);
    expect(res.matched).toBe(matched);
    if (score !== undefined) expect(res.score).toBe(score);
  });

  it("computeBlendPrice blends 7:2:1, falls back, and nulls on missing legs", () => {
    expect(computeBlendPrice({ input: 5, output: 25, cacheHit: 0.5 })).toBeCloseTo(3.85, 5);
    expect(computeBlendPrice({ input: 2, output: 6 })).toBe(2.4);
    expect(computeBlendPrice({})).toBeNull();
    expect(computeBlendPrice(null)).toBeNull();
  });
});

describe("shared/i18n", () => {
  it.each([
    ["{value} min ago", { value: 5 }, "5 min ago"],
    ["hello {name}", undefined, "hello {name}"],
  ])("interpolate(%s) keeps missing placeholders verbatim", (template, params, expected) => {
    expect(interpolate(template, params as never)).toBe(expected);
  });

  it("translates with the requested language and falls back to the key", () => {
    expect(createT("zh")("compareLimit")).toBe("请至少选择 2 个模型进行对比。");
    expect(createT("en")("compareLimit")).toBe("Select at least 2 models to compare.");
    expect(createT("en")("timeMinutesAgo", { value: 3 })).toMatch(/^3/);
    expect(createT("zh")("definitelyNotAKey" as never)).toBe("definitelyNotAKey");
  });

  it("keeps every {placeholder} in step across the dictionaries", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

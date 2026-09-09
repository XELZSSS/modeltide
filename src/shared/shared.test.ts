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
  it("normalizes model limits to bounded buckets", () => {
    expect(normalizeModelLimit(NaN)).toBe(50);
    expect(normalizeModelLimit(1)).toBe(50);
    expect(normalizeModelLimit(50)).toBe(50);
    expect(normalizeModelLimit(51)).toBe(100);
    expect(normalizeModelLimit(150)).toBe(200);
    expect(normalizeModelLimit(500)).toBe(MAX_MODEL_LIMIT);
    expect(normalizeModelLimit(10_000)).toBe(MAX_MODEL_LIMIT);
  });
  it("slices to the requested limit within the max", () => {
    expect(sliceToLimit([1, 2, 3], 2)).toEqual([1, 2]);
    expect(sliceToLimit([1, 2, 3], 0)).toEqual([]);
    expect(sliceToLimit([1, 2, 3], 10_000)).toEqual([1, 2, 3]);
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
  it("shortens TTL on ratio fan-outs at 30%-or-more failures", () => {
    expect(ttlForRatio(0, 6)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(1, 6)).toBe(DEFAULT_TTL_MS);
    expect(ttlForRatio(2, 6)).toBe(ttlFor(true));
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
  it("collapses variant labels, effort qualifiers and separators into one key", () => {
    expect(normalizeModelKey("DeepSeek V4 Pro 0813 (Reasoning, Max Effort)")).toBe("deepseekv4pro0813");
    expect(normalizeModelKey("deepseek/deepseek-v4-pro-0813")).toBe("deepseekv4pro0813");
    expect(normalizeModelKey("Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)")).toBe("claudeopus5");
    expect(normalizeModelKey("claude-opus-5-xhigh")).toBe("claudeopus5");
    expect(normalizeModelKey("Anthropic: Claude Opus 5")).toBe("claudeopus5");
  });
  it("keeps distinct models distinct", () => {
    expect(normalizeModelKey("GLM-5.3 (max)")).not.toBe(normalizeModelKey("GLM-5.3-Flash"));
    expect(normalizeModelKey("GPT-5.6 Terra (max)")).not.toBe(normalizeModelKey("GPT-5.6 Luna (max)"));
  });
  it("scores search terms exact above prefix above substring across any field", () => {
    expect(matchTerm(["gpt-5"], "gpt-5")).toMatchObject({ matched: true, score: 4 });
    expect(matchTerm(["gpt-5", "claude"], "gpt").score).toBe(3);
    expect(matchTerm(["my-gpt-5", "claude"], "gpt").score).toBe(2);
    expect(matchTerm(["openai", "gpt-5-mini"], "mini").matched).toBe(true);
    expect(matchTerm(["", " "], "gpt").matched).toBe(false);
    expect(matchTerm(["gpt-5"], "zzz").matched).toBe(false);
  });
  it("blends prices 7:2:1 with cache/input/output weights", () => {
    expect(computeBlendPrice({ input: 5, output: 25, cacheHit: 0.5 })).toBeCloseTo(3.85, 5);
    expect(computeBlendPrice({ input: 1.4, output: 4.4, cacheHit: 0.26 })).toBeCloseTo(0.902, 5);
  });
  it("falls back to the input price when no cache tier exists", () => {
    expect(computeBlendPrice({ input: 2, output: 6 })).toBe(2.4);
    expect(computeBlendPrice({ input: 2, output: 6, cacheHit: null })).toBe(2.4);
  });
  it("returns null when input or output pricing is missing", () => {
    expect(computeBlendPrice({})).toBeNull();
    expect(computeBlendPrice({ input: 1 })).toBeNull();
    expect(computeBlendPrice(null)).toBeNull();
  });
});

describe("shared/i18n", () => {
  it("interpolates params and keeps missing placeholders verbatim", () => {
    expect(interpolate("{value} min ago", { value: 5 })).toBe("5 min ago");
    expect(interpolate("{a} + {b}", { a: 1, b: "x" })).toBe("1 + x");
    expect(interpolate("hello {name}")).toBe("hello {name}");
    expect(interpolate("hello {name}", { name: null as unknown as string })).toBe("hello {name}");
  });
  it("translates with the requested language and falls back to the key", () => {
    expect(createT("zh")("compareLimit")).toBe("请至少选择 2 个模型进行对比。");
    expect(createT("en")("compareLimit")).toBe("Select at least 2 models to compare.");
    expect(createT("en")("timeMinutesAgo", { value: 3 })).toMatch(/^3/);
    expect(createT("zh")("definitelyNotAKey" as never)).toBe("definitelyNotAKey");
  });
});

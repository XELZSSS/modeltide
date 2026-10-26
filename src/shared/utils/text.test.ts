import { describe, expect, it } from "vitest";
import { dedupeBy, errMsg, normalizeModelKey, titleCase, toStringOrNull } from "./text";

/** One raw model id, and the key it has to normalize to. */
type KeyCase = [title: string, raw: string, key: string];

const KEY_CASES: KeyCase[] = [
  ["drops the provider prefix", "openai/gpt-6-1-sol", "gpt61sol"],
  ["folds case", "GPT-6.1 Sol", "gpt61sol"],
  ["drops the provider prefix of a dotted version", "anthropic/claude-opus-5.5", "claudeopus55"],
  ["drops a parenthesised qualifier before matching", "vendor/model (high effort)", "model"],
  ["strips tuning qualifiers that only appear after a variant separator", "vendor/model:extended", "vendormodel"],
  ["keeps a variant tail that carries a real name", "vendor/model:thinking", "thinking"],
  // `free` named the tier, not the model: every free variant in the catalog normalized to the same key, so a pricing
  // or metadata lookup could answer with a different model's row. The key has to carry the base model.
  ["keys openai/gpt-6-1-sol:free by its base model", "openai/gpt-6-1-sol:free", "gpt61sol"],
  ["keys anthropic/claude-sonnet-5.5:free by its base model", "anthropic/claude-sonnet-5.5:free", "claudesonnet55"],
];

type TitleCaseCase = [title: string, raw: string, expected: string];

const TITLE_CASE_CASES: TitleCaseCase[] = [
  ["splits hyphens and capitalises each word", "gpt-6-1-sol", "Gpt 6 1 Sol"],
  ["splits underscores", "deepseek_v4", "Deepseek V4"],
  ["collapses repeated separators", "a--b__c", "A B C"],
];

type ToStringCase = [title: string, value: unknown, expected: string | null];

const TO_STRING_CASES: ToStringCase[] = [
  ["trims a string", " x ", "x"],
  ["rejects a blank string", "   ", null],
  ["rejects an empty string", "", null],
  ["rejects a number", 42, null],
  ["rejects null", null, null],
  ["rejects undefined", undefined, null],
];

describe("normalizeModelKey", () => {
  it.each(KEY_CASES)("%s", (_title, raw, key) => {
    expect(normalizeModelKey(raw)).toBe(key);
  });
});

describe("dedupeBy", () => {
  const rows = [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
    { id: "a", n: 3 },
    { id: "", n: 4 },
    { id: "", n: 5 },
  ];

  it("keeps the first row per key, treats a blank key as unique and preserves order", () => {
    expect(dedupeBy(rows, (row) => row.id).map((row) => row.n)).toEqual([1, 2, 4, 5]);
  });

  it("treats a null key as unique too", () => {
    const items = [{ k: null }, { k: null }];
    expect(dedupeBy(items, (item) => item.k)).toHaveLength(2);
  });
});

describe("titleCase", () => {
  it.each(TITLE_CASE_CASES)("%s", (_title, raw, expected) => {
    expect(titleCase(raw)).toBe(expected);
  });
});

describe("toStringOrNull", () => {
  it.each(TO_STRING_CASES)("%s", (_title, value, expected) => {
    expect(toStringOrNull(value)).toBe(expected);
  });
});

describe("errMsg", () => {
  it("reads the message off an Error and stringifies anything else", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
    expect(errMsg("plain")).toBe("plain");
    expect(errMsg(undefined)).toBe("undefined");
  });
});

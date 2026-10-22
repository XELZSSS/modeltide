import { describe, expect, it } from "vitest";
import { dedupeBy, errMsg, normalizeModelKey, titleCase, toStringOrNull } from "./text";

describe("normalizeModelKey", () => {
  it("folds the provider prefix away so the same model matches across sources", () => {
    expect(normalizeModelKey("openai/gpt-4o")).toBe("gpt4o");
    expect(normalizeModelKey("GPT-4o")).toBe("gpt4o");
    expect(normalizeModelKey("anthropic/claude-3.5-sonnet")).toBe("claude35sonnet");
  });

  it("drops a parenthesised qualifier before matching", () => {
    expect(normalizeModelKey("vendor/model (high effort)")).toBe("model");
  });

  it("strips tuning qualifiers that only appear after a variant separator", () => {
    expect(normalizeModelKey("vendor/model:extended")).toBe("vendormodel");
  });

  it("keeps a variant tail that carries a real name", () => {
    expect(normalizeModelKey("vendor/model:thinking")).toBe("thinking");
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

  it("keeps the first row per key and preserves order", () => {
    expect(dedupeBy(rows, (row) => row.id).map((row) => row.n)).toEqual([1, 2, 4, 5]);
  });

  it("treats a blank key as unique instead of collapsing every such row", () => {
    expect(dedupeBy(rows, (row) => row.id).filter((row) => row.id === "")).toHaveLength(2);
  });

  it("treats a null key as unique too", () => {
    const items = [{ k: null }, { k: null }];
    expect(dedupeBy(items, (item) => item.k)).toHaveLength(2);
  });
});

describe("titleCase", () => {
  it("splits separators and capitalises each word", () => {
    expect(titleCase("gpt-4o-mini")).toBe("Gpt 4o Mini");
    expect(titleCase("meta_llama")).toBe("Meta Llama");
  });

  it("collapses repeated separators", () => {
    expect(titleCase("a--b__c")).toBe("A B C");
  });
});

describe("toStringOrNull", () => {
  it("trims and rejects blank strings", () => {
    expect(toStringOrNull(" x ")).toBe("x");
    expect(toStringOrNull("   ")).toBeNull();
    expect(toStringOrNull("")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(toStringOrNull(42)).toBeNull();
    expect(toStringOrNull(null)).toBeNull();
    expect(toStringOrNull(undefined)).toBeNull();
  });
});

describe("errMsg", () => {
  it("reads the message off an Error and stringifies anything else", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
    expect(errMsg("plain")).toBe("plain");
    expect(errMsg(undefined)).toBe("undefined");
  });
});

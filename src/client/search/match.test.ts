import { describe, expect, it } from "vitest";
import { filterByTerm, foldSearchStr, fuzzyHit, matchFolded, preparedFieldsFor } from "./match";

interface Row {
  id: string;
  name: string;
  provider: string | null;
}

const fieldsOf = (row: Row) => [row.name, row.provider];

describe("foldSearchStr", () => {
  it("lowercases, trims and collapses inner whitespace", () => {
    expect(foldSearchStr("  GPT-4o   Turbo ")).toBe("gpt-4o turbo");
  });

  it("keeps CJK text intact", () => {
    expect(foldSearchStr("  通义  千问 ")).toBe("通义 千问");
  });
});

describe("matchFolded", () => {
  const folded = ["gpt-4o", "claude 3.5 sonnet"];

  it("never matches an empty needle", () => {
    expect(matchFolded(folded, "")).toEqual({ matched: false, score: 0 });
  });

  it("scores an exact hit highest", () => {
    expect(matchFolded(folded, "gpt-4o")).toEqual({ matched: true, score: 4 });
  });

  it("ranks a prefix hit above a substring hit", () => {
    expect(matchFolded(folded, "claude")).toEqual({ matched: true, score: 3 });
    expect(matchFolded(folded, "3.5")).toEqual({ matched: true, score: 2 });
  });

  it("reports no match when no field contains the needle", () => {
    expect(matchFolded(folded, "gemini")).toEqual({ matched: false, score: 0 });
  });
});

describe("filterByTerm", () => {
  const rows: Row[] = [
    { id: "a", name: "GPT-4o", provider: "OpenAI" },
    { id: "b", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
    { id: "c", name: "Llama 3.1", provider: null },
  ];

  it("returns the input untouched for a blank term", () => {
    expect(filterByTerm(rows, "   ", fieldsOf)).toBe(rows);
  });

  it("matches any field case-insensitively", () => {
    expect(filterByTerm(rows, "openai", fieldsOf).map((r) => r.id)).toEqual(["a"]);
    expect(filterByTerm(rows, "CLAUDE", fieldsOf).map((r) => r.id)).toEqual(["b"]);
  });

  it("skips null fields but keeps input order", () => {
    expect(filterByTerm(rows, "3", fieldsOf).map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("preparedFieldsFor", () => {
  it("caches folding per item and accessor so repeated keystrokes reuse the work", () => {
    const row: Row = { id: "a", name: "Gemini 1.5 Pro", provider: null };
    const first = preparedFieldsFor(row, fieldsOf);
    expect(preparedFieldsFor(row, fieldsOf)).toBe(first);
    const second = preparedFieldsFor(row, (r) => [`${r.name} changed`]);
    expect(second.folded).toEqual(["gemini 1.5 pro changed"]);
  });
});

describe("fuzzyHit", () => {
  it("stays off for needles shorter than three characters", () => {
    expect(
      fuzzyHit(
        preparedFieldsFor({ name: "opus" }, (r) => [r.name]),
        "op",
      ),
    ).toBe(false);
  });

  it("tolerates a single-character typo", () => {
    expect(
      fuzzyHit(
        preparedFieldsFor({ name: "sonnet" }, (r) => [r.name]),
        "sonet",
      ),
    ).toBe(true);
  });

  it("rejects a needle too far from every token", () => {
    expect(
      fuzzyHit(
        preparedFieldsFor({ name: "sonnet" }, (r) => [r.name]),
        "quartz",
      ),
    ).toBe(false);
  });

  it("matches through CJK bigrams of a long name", () => {
    const prepared = preparedFieldsFor({ name: "阿里巴巴通义千问" }, (r) => [r.name]);
    expect(prepared.tokens[0]).toContain("义千");
    expect(fuzzyHit(prepared, "义千文")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { filterByTerm, foldSearchStr, fuzzyHit, matchFolded, preparedFieldsFor } from "./match";

interface Row {
  id: string;
  name: string;
  provider: string | null;
}

const fieldsOf = (row: Row) => [row.name, row.provider];
const nameOnly = (row: { name: string }) => [row.name];

const preparedName = (name: string) => preparedFieldsFor({ name }, nameOnly);

const FOLDED = ["gpt-6.1 sol (max)", "claude opus 5.5", "glm 5.3 flash"];

const ROWS: Row[] = [
  { id: "a", name: "GPT-6.1 Sol (Max)", provider: "OpenAI" },
  { id: "b", name: "Claude Opus 5.5", provider: "Anthropic" },
  { id: "c", name: "GLM 5.3 Flash", provider: null },
];

const idsFor = (term: string) => filterByTerm(ROWS, term, fieldsOf).map((row) => row.id);

describe("foldSearchStr", () => {
  it.each([
    {
      title: "lowercases, trims and collapses inner whitespace",
      input: "  GPT-6.1 Sol   Max ",
      folded: "gpt-6.1 sol max",
    },
    { title: "keeps CJK text intact", input: "  通义  千问 ", folded: "通义 千问" },
  ])("$title", ({ input, folded }) => {
    expect(foldSearchStr(input)).toBe(folded);
  });
});

describe("matchFolded", () => {
  it.each([
    { title: "never matches an empty needle", needle: "", expected: { matched: false, score: 0 } },
    {
      title: "scores an exact hit highest",
      needle: "gpt-6.1 sol (max)",
      expected: { matched: true, score: 4 },
    },
    { title: "scores a prefix hit below an exact one", needle: "claude", expected: { matched: true, score: 3 } },
    { title: "scores a substring hit lowest", needle: "5.3", expected: { matched: true, score: 2 } },
    {
      title: "reports no match when no field contains the needle",
      needle: "gemini",
      expected: { matched: false, score: 0 },
    },
  ])("$title", ({ needle, expected }) => {
    expect(matchFolded(FOLDED, needle)).toEqual(expected);
  });
});

describe("filterByTerm", () => {
  it("returns the input untouched for a blank term", () => {
    expect(filterByTerm(ROWS, "   ", fieldsOf)).toBe(ROWS);
  });

  it.each([
    { title: "matches the provider field case-insensitively", term: "openai", ids: ["a"] },
    { title: "matches the name field case-insensitively", term: "CLAUDE", ids: ["b"] },
    { title: "skips null fields but keeps input order", term: "5", ids: ["b", "c"] },
  ])("$title", ({ term, ids }) => {
    expect(idsFor(term)).toEqual(ids);
  });
});

describe("preparedFieldsFor", () => {
  it("caches folding per item and accessor so repeated keystrokes reuse the work", () => {
    const row: Row = { id: "a", name: "Gemini 4 Carbon", provider: null };
    const first = preparedFieldsFor(row, fieldsOf);
    expect(preparedFieldsFor(row, fieldsOf)).toBe(first);
    const second = preparedFieldsFor(row, (r) => [`${r.name} changed`]);
    expect(second.folded).toEqual(["gemini 4 carbon changed"]);
  });
});

describe("fuzzyHit", () => {
  it.each([
    { title: "stays off for needles shorter than three characters", name: "Claude Opus 5.5", needle: "op", hit: false },
    { title: "tolerates a single-character typo", name: "Claude Sonnet 5.5", needle: "sonet", hit: true },
    { title: "rejects a needle too far from every token", name: "Claude Sonnet 5.5", needle: "quartz", hit: false },
  ])("$title", ({ name, needle, hit }) => {
    expect(fuzzyHit(preparedName(name), needle)).toBe(hit);
  });

  it("matches through CJK bigrams of a long name", () => {
    const prepared = preparedName("阿里巴巴通义千问");
    expect(prepared.tokens[0]).toContain("义千");
    expect(fuzzyHit(prepared, "义千文")).toBe(true);
  });
});

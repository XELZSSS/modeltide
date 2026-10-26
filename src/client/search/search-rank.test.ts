import { describe, expect, it } from "vitest";
import type { OpenSourceModelEntry } from "@/shared/types";
import { openSourceRow } from "@/test/fixtures";
import { collect, defineSource, detailLink, rankSearchHits } from "./search-rank";
import type { SearchResult } from "./types";

function row(id: string, author: string | null = null): OpenSourceModelEntry {
  return openSourceRow({ id, author });
}

function sourceOf(entries: readonly OpenSourceModelEntry[]) {
  return defineSource(
    entries,
    (model) => [model.id, model.author],
    (model): SearchResult => ({
      id: model.id,
      name: model.id,
      source: "openSourceRankings",
      score: null,
      scoreLabel: null,
      provider: model.author,
      link: detailLink("openSourceRankings", model.id),
    }),
  );
}

function hit(name: string, source: SearchResult["source"], match: number, score: number | null = null) {
  return {
    result: { id: name.toLowerCase(), name, source, score, scoreLabel: null, provider: null, link: `/model/${name}` },
    match,
  };
}

/** Each row: the ids to search, the needle, and the (id, match) pairs `collect` has to keep. */
type CollectCase = [title: string, ids: string[], needle: string, hits: [id: string, match: number][]];

const COLLECT_CASES: CollectCase[] = [
  [
    "ranks an exact hit above a prefix hit from the same source",
    ["glm-5.3", "glm-5.3-flash"],
    "glm-5.3",
    [
      ["glm-5.3", 4],
      ["glm-5.3-flash", 3],
    ],
  ],
  ["falls back to fuzzy hits only after the exact pass", ["sonnet"], "sonet", [["sonnet", 1]]],
  ["returns nothing when no entry matches", ["sonnet"], "quartz", []],
];

type OrderCase = [title: string, hits: ReturnType<typeof hit>[], names: string[]];

const ORDER_CASES: OrderCase[] = [
  [
    "breaks a match tie by source priority",
    [hit("beta", "openSourceRankings", 4), hit("alpha", "modelRankings", 4)],
    ["alpha", "beta"],
  ],
  [
    "breaks a same-source tie by descending score",
    [hit("low", "modelRankings", 4, 5), hit("high", "modelRankings", 4, 10)],
    ["high", "low"],
  ],
];

type LinkCase = [title: string, source: SearchResult["source"], id: string, link: string];

const LINK_CASES: LinkCase[] = [
  ["maps a source onto its detail route", "openSourceRankings", "org/model", "/model/os/org/model"],
  ["encodes each id segment", "hallucinationRankings", "a b", "/model/hall/a%20b"],
];

describe("collect", () => {
  it.each(COLLECT_CASES)("%s", (_title, ids, needle, hits) => {
    const collected = collect(sourceOf(ids.map((id) => row(id))), needle);
    expect(collected.map((h) => [h.result.id, h.match])).toEqual(hits);
  });

  it("caps the source and keeps the strongest matches", () => {
    const collected = collect(sourceOf([row("glm-5.3"), row("glm-5.3-flash"), row("xglm-5.3")]), "glm-5.3", 2);
    expect(collected.map((h) => [h.result.id, h.match])).toEqual([
      ["glm-5.3", 4],
      ["glm-5.3-flash", 3],
    ]);
  });
});

describe("rankSearchHits", () => {
  it.each(ORDER_CASES)("%s", (_title, hits, names) => {
    expect(rankSearchHits(hits).map((r) => r.name)).toEqual(names);
  });

  it("dedupes the same model reached through different sources", () => {
    const ordered = rankSearchHits([
      hit("GPT-6.1 Sol", "modelRankings", 4),
      hit("gpt-6.1 sol", "openSourceRankings", 4),
    ]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0]!.source).toBe("modelRankings");
  });

  it("caps the result list at twenty entries", () => {
    const hits = Array.from({ length: 25 }, (_, i) => hit(`model-${i}`, "modelRankings", 4));
    expect(rankSearchHits(hits)).toHaveLength(20);
  });

  it("does not mutate the incoming list", () => {
    const hits = [hit("b", "openSourceRankings", 2), hit("a", "modelRankings", 4)];
    rankSearchHits(hits);
    expect(hits.map((h) => h.result.name)).toEqual(["b", "a"]);
  });
});

describe("detailLink", () => {
  it.each(LINK_CASES)("%s", (_title, source, id, link) => {
    expect(detailLink(source, id)).toBe(link);
  });
});

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

describe("collect", () => {
  it("ranks an exact hit above a prefix hit from the same source", () => {
    const hits = collect(sourceOf([row("qwen"), row("qwen-turbo")]), "qwen");
    expect(hits.map((h) => [h.result.id, h.match])).toEqual([
      ["qwen", 4],
      ["qwen-turbo", 3],
    ]);
  });

  it("caps the source and keeps the strongest matches", () => {
    const hits = collect(sourceOf([row("model"), row("model-pro"), row("xmodel")]), "model", 2);
    expect(hits.map((h) => h.match)).toEqual([4, 3]);
  });

  it("falls back to fuzzy hits only after the exact pass", () => {
    const hits = collect(sourceOf([row("sonnet")]), "sonet");
    expect(hits.map((h) => [h.result.id, h.match])).toEqual([["sonnet", 1]]);
  });

  it("returns nothing when no entry matches", () => {
    expect(collect(sourceOf([row("sonnet")]), "quartz")).toEqual([]);
  });
});

describe("rankSearchHits", () => {
  it("breaks a match tie by source priority", () => {
    const ordered = rankSearchHits([hit("beta", "openSourceRankings", 4), hit("alpha", "modelRankings", 4)]);
    expect(ordered.map((r) => r.name)).toEqual(["alpha", "beta"]);
  });

  it("breaks a same-source tie by descending score", () => {
    const ordered = rankSearchHits([hit("low", "modelRankings", 4, 5), hit("high", "modelRankings", 4, 10)]);
    expect(ordered.map((r) => r.name)).toEqual(["high", "low"]);
  });

  it("dedupes the same model reached through different sources", () => {
    const ordered = rankSearchHits([hit("GPT-4o", "modelRankings", 4), hit("gpt-4o", "openSourceRankings", 4)]);
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
  it("maps the search source onto its detail route and encodes segments", () => {
    expect(detailLink("openSourceRankings", "org/model")).toBe("/model/os/org/model");
    expect(detailLink("hallucinationRankings", "a b")).toBe("/model/hall/a%20b");
  });
});

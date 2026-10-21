import { describe, expect, it } from "vitest";
import { LicenseDropTally, keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import type { OpenSourceModelEntry } from "@/shared/types";

function hfRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    _id: "68a1b2c3d4e5f6a7b8c9d0e1",
    id: "acme/model-7b",
    author: "acme",
    downloads: 1234567,
    likes: 890,
    tags: ["license:apache-2.0", "text-generation"],
    pipeline_tag: "text-generation",
    createdAt: "2025-06-01T00:00:00.000Z",
    lastModified: "2026-04-19T08:00:00.000Z",
    ...overrides,
  };
}

describe("mapListModel", () => {
  it("maps a live HF list row onto the ranking entry shape", () => {
    const entry = mapListModel(hfRow());
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      id: "acme/model-7b",
      author: "acme",
      downloads: 1234567,
      likes: 890,
      license: "apache-2.0",
      task: "text-generation",
    });
    // The full ISO timestamp is preserved, not truncated to the date part.
    expect((entry as OpenSourceModelEntry).createdAt).toBe("2025-06-01T00:00:00.000Z");
    // List rows drop tags on purpose — they stay a directory-only concern.
    expect((entry as OpenSourceModelEntry).tags).toEqual([]);
  });

  it("resolves the licence from the licence-tag list and prefers the open one", () => {
    expect(mapListModel(hfRow())?.license).toBe("apache-2.0");
    expect(mapListModel(hfRow({ tags: ["license:unknown", "license:mit"] }))?.license).toBe("mit");
    expect(mapListModel(hfRow({ tags: [] }))?.license).toBeNull();
  });

  it("falls back to the id prefix when author is missing", () => {
    expect(mapListModel(hfRow({ author: null }))?.author).toBe("acme");
    // A bare id without an owner prefix falls back to the whole id.
    expect(mapListModel(hfRow({ id: "model-7b", author: null }))?.author).toBe("model-7b");
  });

  it("keeps malformed dates as null instead of inventing one", () => {
    const entry = mapListModel(hfRow({ createdAt: "" }));
    expect(entry?.createdAt).toBeNull();
    expect(entry?.lastModified).toBe("2026-04-19T08:00:00.000Z");
  });

  it("rejects non-objects and unusable ids", () => {
    expect(mapListModel(null)).toBeNull();
    expect(mapListModel(42)).toBeNull();
    expect(mapListModel(hfRow({ id: "n/a" }))).toBeNull();
    expect(mapListModel(hfRow({ id: 7 }))).toBeNull();
  });

  it("counts downloads, likes and non-negative numeric strings only", () => {
    expect(mapListModel(hfRow({ downloads: -5, likes: "12" }))?.downloads).toBe(0);
    expect(mapListModel(hfRow({ likes: "12" }))?.likes).toBe(12);
  });
});

describe("mapModel", () => {
  it("is the directory variant: same mapping but tags included", () => {
    const entry = mapModel(hfRow({ tags: ["license:mit", "language:zh"] }));
    expect(entry).toMatchObject({ id: "acme/model-7b", license: "mit" });
    expect(entry?.tags).toEqual(["license:mit", "language:zh"]);
  });
});

describe("LicenseDropTally + keepOpenSourceRanking", () => {
  it("separates licenceless rows from declared non-open licences and names unknown tags", () => {
    const tally = new LicenseDropTally();
    tally.record([], null); // no licence tag at all
    tally.record(["other"], null); // known non-open
    tally.record(["made-up-lab-license"], null); // unknown non-open
    expect(tally.drops()).toEqual({
      withoutTag: 1,
      declaredNonOpen: 2,
      unknownTags: ["made-up-lab-license"],
      noDownloads: 0,
    });
  });

  it("gates ranking by downloads and reports zero-download drops", () => {
    const tally = new LicenseDropTally();
    expect(keepOpenSourceRanking({ downloads: 1 }, tally)).toBe(true);
    expect(keepOpenSourceRanking({ downloads: 0 }, tally)).toBe(false);
    expect(keepOpenSourceRanking({ downloads: Number.NaN }, tally)).toBe(false);
    expect(tally.drops().noDownloads).toBe(2);
  });
});

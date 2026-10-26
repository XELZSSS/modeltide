import { describe, expect, it } from "vitest";
import { keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import { LicenseDropTally } from "./license-tally";
import type { OpenSourceModelEntry } from "@/shared/types";

/** The tag lists the drop tally has to classify: no tag, a foreign tag, an unknown licence tag. */
const RECORDED_TAG_LISTS: string[][] = [[], ["other"], ["made-up-lab-license"]];

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

/** One field of the mapped entry: the row override, the reader for that field, and the value it has to end up with. */
type FieldCase = [
  title: string,
  overrides: Partial<Record<string, unknown>>,
  read: (entry: OpenSourceModelEntry) => unknown,
  expected: unknown,
];

const FIELD_CASES: FieldCase[] = [
  [
    "prefers the open licence tag over an unknown one",
    { tags: ["license:unknown", "license:mit"] },
    (e) => e.license,
    "mit",
  ],
  ["leaves the licence null without a licence tag", { tags: [] }, (e) => e.license, null],
  ["falls back to the id prefix when the author is missing", { author: null }, (e) => e.author, "acme"],
  ["falls back to the whole id when there is no prefix", { id: "model-7b", author: null }, (e) => e.author, "model-7b"],
  ["keeps a malformed date null instead of inventing one", { createdAt: "" }, (e) => e.createdAt, null],
  ["keeps the sibling date intact", { createdAt: "" }, (e) => e.lastModified, "2026-04-19T08:00:00.000Z"],
  ["zeroes a negative download count", { downloads: -5, likes: "12" }, (e) => e.downloads, 0],
  ["reads a non-negative numeric string", { likes: "12" }, (e) => e.likes, 12],
];

describe("mapListModel", () => {
  it("maps a live HF list row onto the ranking entry shape", () => {
    const entry = mapListModel(hfRow());
    expect(entry).toMatchObject({
      id: "acme/model-7b",
      author: "acme",
      downloads: 1234567,
      likes: 890,
      license: "apache-2.0",
      task: "text-generation",
    });
    expect(entry?.createdAt).toBe("2025-06-01T00:00:00.000Z");
    expect(entry?.tags).toBeUndefined();
  });

  it.each(FIELD_CASES)("%s", (_title, overrides, read, expected) => {
    expect(read(mapListModel(hfRow(overrides)) as OpenSourceModelEntry)).toBe(expected);
  });

  it("rejects non-objects and unusable ids", () => {
    expect(mapListModel(null)).toBeNull();
    expect(mapListModel(42)).toBeNull();
    expect(mapListModel(hfRow({ id: "n/a" }))).toBeNull();
    expect(mapListModel(hfRow({ id: 7 }))).toBeNull();
  });
});

describe("mapModel", () => {
  it("keeps tags on the directory variant", () => {
    const entry = mapModel(hfRow({ tags: ["license:mit", "language:zh"] }));
    expect(entry).toMatchObject({ id: "acme/model-7b", license: "mit" });
    expect(entry?.tags).toEqual(["license:mit", "language:zh"]);
  });
});

describe("LicenseDropTally + keepOpenSourceRanking", () => {
  it("counts licenceless and non-open drops and names unknown tags", () => {
    const tally = new LicenseDropTally();
    for (const tags of RECORDED_TAG_LISTS) tally.record(tags, null);
    expect(tally.drops()).toEqual({
      withoutTag: 1,
      declaredNonOpen: 2,
      unknownTags: ["made-up-lab-license"],
      noDownloads: 0,
    });
  });

  it("gates ranking by downloads and counts the drops", () => {
    const tally = new LicenseDropTally();
    expect(keepOpenSourceRanking({ downloads: 1 }, tally)).toBe(true);
    expect(keepOpenSourceRanking({ downloads: 0 }, tally)).toBe(false);
    expect(keepOpenSourceRanking({ downloads: Number.NaN }, tally)).toBe(false);
    expect(tally.drops().noDownloads).toBe(2);
  });
});

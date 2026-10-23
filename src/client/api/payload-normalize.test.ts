import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPayloadShape, normalizeHomeDashboard, unwrapListPartial } from "./payload-normalize";

const list = (...ids: string[]) => ids.map((id) => ({ id }));

describe("unwrapListPartial", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a payload that has not arrived yet as pending, not broken", () => {
    expect(unwrapListPartial(undefined, "domain")).toEqual({ data: [], partial: false, malformed: false });
  });

  it("reports a null payload as malformed so callers show an error, not an empty list", () => {
    expect(unwrapListPartial(null, "domain")).toEqual({ data: [], partial: false, malformed: true });
  });

  it("reports an envelope without a data field as malformed", () => {
    expect(unwrapListPartial({}, "domain").malformed).toBe(true);
    expect(unwrapListPartial({ data: null }, "domain").malformed).toBe(true);
    expect(unwrapListPartial({ data: { rows: [] } }, "domain").malformed).toBe(true);
  });

  it("reports a non-object payload as malformed", () => {
    expect(unwrapListPartial("no", "domain").malformed).toBe(true);
  });

  it("decodes a well-formed payload and keeps the partial flag", () => {
    const payload = { data: list("a", "b"), fetchedAt: "2026-01-01T00:00:00.000Z", partial: true };
    expect(unwrapListPartial<{ id: string }>(payload, "domain")).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      partial: true,
      malformed: false,
    });
  });
});

describe("normalizeHomeDashboard", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const payloadOf = (data: unknown, partial = false) => ({
    data,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    partial,
  });

  it("passes through every well-formed list", () => {
    const normalized = normalizeHomeDashboard(
      payloadOf({
        orRankings: [{ rank: 1 }],
        textToImage: [{ slug: "x" }],
        opensource: [{ id: "m", downloads: 1 }],
        chart: [{ id: "c" }],
        providers: [{ name: "p" }],
        hallucinations: [{ model: "h" }],
      }),
    );
    expect(normalized.malformed).toBe(false);
    expect(normalized.partial).toBe(false);
    expect(normalized.orRankings).toHaveLength(1);
    expect(normalized.textToImage).toHaveLength(1);
    expect(normalized.opensource).toHaveLength(1);
    expect(normalized.chart).toHaveLength(1);
    expect(normalized.providers).toHaveLength(1);
    expect(normalized.hallucinations).toHaveLength(1);
  });

  it("carries the partial flag through", () => {
    const normalized = normalizeHomeDashboard(
      payloadOf(
        { orRankings: [], textToImage: [], opensource: [], chart: [], providers: [], hallucinations: [] },
        true,
      ),
    );
    expect(normalized.partial).toBe(true);
    expect(normalized.malformed).toBe(false);
  });

  it("reports a null payload as malformed with empty lists", () => {
    const normalized = normalizeHomeDashboard(null);
    expect(normalized).toEqual({
      orRankings: [],
      textToImage: [],
      opensource: [],
      chart: [],
      providers: [],
      hallucinations: [],
      partial: false,
      malformed: true,
    });
  });

  it("reports a missing list as malformed while keeping the lists that are present", () => {
    const normalized = normalizeHomeDashboard(payloadOf({ orRankings: [{ rank: 1 }] }));
    expect(normalized.malformed).toBe(true);
    expect(normalized.orRankings).toHaveLength(1);
    expect(normalized.textToImage).toEqual([]);
  });

  it("reports a list of the wrong type as malformed", () => {
    const normalized = normalizeHomeDashboard(payloadOf({ orRankings: [], textToImage: "nope", opensource: [] }));
    expect(normalized.malformed).toBe(true);
    expect(normalized.textToImage).toEqual([]);
  });
});

describe("assertPayloadShape", () => {
  it("throws a labelled error for a malformed payload", () => {
    expect(() => assertPayloadShape(true, "artificialIndex")).toThrow("artificialIndex: malformed payload");
  });

  it("stays quiet for a healthy payload", () => {
    expect(() => assertPayloadShape(false, "artificialIndex")).not.toThrow();
  });
});

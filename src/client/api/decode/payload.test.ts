import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPayloadShape, normalizeHomeDashboard, unwrapListPartial } from "./payload";

const list = (...ids: string[]) => ids.map((id) => ({ id }));

const DOMAIN = "domain";
const INDEX_LABEL = "artificialIndex";

const EMPTY_LISTS = {
  textToImage: [],
  opensource: [],
  openSourceTasks: [],
  chart: [],
  providers: [],
  hallucinations: [],
};

/** What `unwrapListPartial` answers when it cannot decode the payload: an empty list plus the flag. */
const MALFORMED_LIST = { data: [], partial: false, malformed: true };

/** One row per case: the row body is that case's assertion. */
type Case = [title: string, run: () => void];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("unwrapListPartial", () => {
  it.each([
    [
      "treats a payload that has not arrived yet as pending, not broken",
      undefined,
      { data: [], partial: false, malformed: false },
    ],
    ["reports a null payload as malformed so callers show an error, not an empty list", null, MALFORMED_LIST],
    ["reports a non-object payload as malformed", "no", MALFORMED_LIST],
    ["reports an envelope without a data field as malformed", {}, MALFORMED_LIST],
    ["reports a null data field as malformed", { data: null }, MALFORMED_LIST],
    ["reports a non-array data field as malformed", { data: { rows: [] } }, MALFORMED_LIST],
  ])("%s", (_title, payload, expected) => {
    expect(unwrapListPartial(payload, DOMAIN)).toEqual(expected);
  });

  it("decodes a well-formed payload and keeps the partial flag", () => {
    const payload = { data: list("a", "b"), partial: true };
    expect(unwrapListPartial<{ id: string }>(payload, DOMAIN)).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      partial: true,
      malformed: false,
    });
  });
});

describe("normalizeHomeDashboard", () => {
  const payloadOf = (data: unknown, partial = false) => ({
    data,
    partial,
  });

  it("passes through every well-formed list", () => {
    const normalized = normalizeHomeDashboard(
      payloadOf({
        textToImage: [{ slug: "x" }],
        opensource: [{ id: "m", downloads: 1 }],
        openSourceTasks: [{ key: "text-generation", total: 1 }],
        chart: [{ id: "c" }],
        providers: [{ name: "p" }],
        hallucinations: [{ name: "h" }],
      }),
    );
    expect(normalized.malformed).toBe(false);
    expect(normalized.partial).toBe(false);
    expect(normalized.textToImage).toHaveLength(1);
    expect(normalized.opensource).toHaveLength(1);
    expect(normalized.openSourceTasks).toHaveLength(1);
    expect(normalized.chart).toHaveLength(1);
    expect(normalized.providers).toHaveLength(1);
    expect(normalized.hallucinations).toHaveLength(1);
  });

  it("carries the partial flag through", () => {
    const normalized = normalizeHomeDashboard(payloadOf(EMPTY_LISTS, true));
    expect(normalized.partial).toBe(true);
    expect(normalized.malformed).toBe(false);
  });

  it("reports a null payload as malformed with empty lists", () => {
    const normalized = normalizeHomeDashboard(null);
    expect(normalized).toEqual({
      ...EMPTY_LISTS,
      partial: false,
      malformed: true,
    });
  });

  it("reports a missing list as malformed while keeping the lists that are present", () => {
    const normalized = normalizeHomeDashboard(payloadOf({ textToImage: [{ slug: "x" }] }));
    expect(normalized.malformed).toBe(true);
    expect(normalized.textToImage).toHaveLength(1);
    expect(normalized.opensource).toEqual([]);
  });

  it("reports a list of the wrong type as malformed", () => {
    const normalized = normalizeHomeDashboard(payloadOf({ textToImage: "nope", opensource: [] }));
    expect(normalized.malformed).toBe(true);
    expect(normalized.textToImage).toEqual([]);
  });
});

describe("assertPayloadShape", () => {
  it.each<Case>([
    [
      "throws a labelled error for a malformed payload",
      () => expect(() => assertPayloadShape(true, INDEX_LABEL)).toThrow("artificialIndex: malformed payload"),
    ],
    ["stays quiet for a healthy payload", () => expect(() => assertPayloadShape(false, INDEX_LABEL)).not.toThrow()],
  ])("%s", (_, run) => run());
});

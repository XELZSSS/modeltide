import { describe, expect, it } from "vitest";
import { partialPollInterval } from "./partial-poll";

const REFETCH_MS = 600_000;

const PARTIAL = { partial: true, data: [] };
const COMPLETE = { partial: false, data: [] };
/** Every settled update count that still falls inside one polling budget. */
const SETTLED_COUNTS = [0, 1, 2, 3, 4];

const isPartial = (data: unknown): boolean => (data as { partial?: unknown } | null)?.partial === true;

function poll(key: string, data: unknown, dataUpdateCount = 0, errorUpdateCount = 0): number | false {
  return partialPollInterval(
    { queryKey: ["poll-test", key], state: { data, dataUpdateCount, errorUpdateCount } },
    isPartial,
    REFETCH_MS,
  );
}

describe("partialPollInterval", () => {
  it("never polls a complete or missing payload", () => {
    expect(poll("complete", COMPLETE, 3)).toBe(false);
    expect(poll("missing", undefined)).toBe(false);
  });

  it("keeps polling while the payload stays partial", () => {
    expect(poll("keeps", PARTIAL, 0)).toBe(REFETCH_MS);
    expect(poll("keeps", PARTIAL, 1)).toBe(REFETCH_MS);
  });

  it("spends five settlements then opens a fresh window", () => {
    const key = "budget";
    for (const settled of SETTLED_COUNTS) expect(poll(key, PARTIAL, settled)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 5)).toBe(false);
    expect(poll(key, PARTIAL, 6)).toBe(REFETCH_MS);
  });

  it("counts failed refetches against the same budget", () => {
    const key = "errors";
    expect(poll(key, PARTIAL, 0, 0)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 2, 3)).toBe(false);
  });

  it("restarts the window when a query reset drops the counters", () => {
    const key = "reset";
    expect(poll(key, PARTIAL, 3)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 6)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 0)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 4)).toBe(REFETCH_MS);
    expect(poll(key, PARTIAL, 5)).toBe(false);
  });

  it("clears the budget once the payload is complete", () => {
    const key = "cleared";
    expect(poll(key, PARTIAL, 4)).toBe(REFETCH_MS);
    expect(poll(key, COMPLETE, 5)).toBe(false);
    expect(poll(key, PARTIAL, 9)).toBe(REFETCH_MS);
  });
});

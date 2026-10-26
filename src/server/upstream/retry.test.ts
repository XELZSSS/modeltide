import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBackoff, parseRetryAfterMs } from "./retry";
import { BACKOFF_MAX_MS, RETRY_AFTER_MAX_MS } from "./timeouts";

const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;

/** The attempts the documented band has to hold for: base * 2^attempt, capped at BACKOFF_MAX_MS. */
const BACKOFF_ATTEMPTS = [0, 1, 2, 3, 4, 5];

function retryAfterResponse(value?: string): Response {
  return new Response(null, { status: 429, headers: value == null ? {} : { "retry-after": value } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computeBackoff", () => {
  it.each([
    [0, BACKOFF_BASE_MS],
    [1, 2 * BACKOFF_BASE_MS],
    [2, BACKOFF_MAX_MS],
    [6, BACKOFF_MAX_MS],
  ])("doubles from the base for attempt %i", (attempt, expected) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(computeBackoff(attempt)).toBe(expected);
  });

  it("adds at most BACKOFF_JITTER_MS of jitter on top of the base delay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999_999);
    expect(computeBackoff(0)).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
    expect(computeBackoff(0)).toBeLessThan(BACKOFF_BASE_MS + BACKOFF_JITTER_MS);
    expect(computeBackoff(2)).toBe(BACKOFF_MAX_MS);
  });

  it.each(BACKOFF_ATTEMPTS)("stays inside [base * 2^attempt, BACKOFF_MAX_MS] for attempt %i", (attempt) => {
    const floor = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
    const value = computeBackoff(attempt);
    expect(value).toBeGreaterThanOrEqual(floor);
    expect(value).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });

  it("grows with the attempt", () => {
    expect(computeBackoff(0)).toBeLessThan(computeBackoff(1));
    expect(computeBackoff(1)).toBeLessThan(computeBackoff(2));
  });
});

/** The header values that are read as a number of seconds, and the ones that are not a delay at all. */
const RETRY_AFTER_CASES: ReadonlyArray<[title: string, header: string | undefined, expected: number | null]> = [
  ["reads delta-seconds as milliseconds", "3", 3000],
  ["ignores spaces around the value", " 12 ", 12_000],
  ["returns null for a missing header", undefined, null],
  ["returns null for an empty header", "", null],
  ["returns null for a zero delta", "0", null],
  ["returns null for a non-numeric header", "soon", null],
  ["clamps a huge delta-seconds value to RETRY_AFTER_MAX_MS", "3600", RETRY_AFTER_MAX_MS],
  ["clamps the cap itself to RETRY_AFTER_MAX_MS", String(RETRY_AFTER_MAX_MS), RETRY_AFTER_MAX_MS],
];

describe("parseRetryAfterMs", () => {
  it.each(RETRY_AFTER_CASES)("%s", (_title, header, expected) => {
    expect(parseRetryAfterMs(retryAfterResponse(header))).toBe(expected);
  });

  it("reads an HTTP-date as the remaining delay until that moment", () => {
    const delay = parseRetryAfterMs(retryAfterResponse(new Date(Date.now() + 10_000).toUTCString()));
    expect(delay).toBeGreaterThan(8_000);
    expect(delay).toBeLessThanOrEqual(10_000);
  });

  it("returns null for an HTTP-date that is already in the past", () => {
    expect(parseRetryAfterMs(retryAfterResponse(new Date(Date.now() - 60_000).toUTCString()))).toBeNull();
  });
});

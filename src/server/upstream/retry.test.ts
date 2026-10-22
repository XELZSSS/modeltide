import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBackoff, parseRetryAfterMs } from "./retry";
import { BACKOFF_MAX_MS, RETRY_AFTER_MAX_MS } from "./timeouts";

const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;

function retryAfterResponse(value?: string): Response {
  return new Response(null, { status: 429, headers: value == null ? {} : { "retry-after": value } });
}

const randomSpies: { mockRestore: () => void }[] = [];

function mockRandom(value: number): void {
  randomSpies.push(vi.spyOn(Math, "random").mockReturnValue(value));
}

afterEach(() => {
  for (const spy of randomSpies.splice(0)) spy.mockRestore();
});

describe("computeBackoff", () => {
  it("doubles from the base per attempt and stops at BACKOFF_MAX_MS", () => {
    mockRandom(0);
    expect(computeBackoff(0)).toBe(BACKOFF_BASE_MS);
    expect(computeBackoff(1)).toBe(2 * BACKOFF_BASE_MS);
    expect(computeBackoff(2)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoff(6)).toBe(BACKOFF_MAX_MS);
  });

  it("adds at most BACKOFF_JITTER_MS of jitter on top of the base delay", () => {
    mockRandom(0.999_999);
    expect(computeBackoff(0)).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
    expect(computeBackoff(0)).toBeLessThan(BACKOFF_BASE_MS + BACKOFF_JITTER_MS);
    expect(computeBackoff(2)).toBe(BACKOFF_MAX_MS);
  });

  it("stays inside [base * 2^attempt, BACKOFF_MAX_MS] and grows with the attempt", () => {
    for (let attempt = 0; attempt <= 5; attempt++) {
      const floor = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
      const value = computeBackoff(attempt);
      expect(value).toBeGreaterThanOrEqual(floor);
      expect(value).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
    expect(computeBackoff(0)).toBeLessThan(computeBackoff(1));
    expect(computeBackoff(1)).toBeLessThan(computeBackoff(2));
    expect(computeBackoff(2)).toBe(BACKOFF_MAX_MS);
  });
});

describe("parseRetryAfterMs", () => {
  it("reads delta-seconds and converts them to milliseconds", () => {
    expect(parseRetryAfterMs(retryAfterResponse("3"))).toBe(3000);
    expect(parseRetryAfterMs(retryAfterResponse(" 12 "))).toBe(12_000);
  });

  it("returns null for a missing, zero or non-numeric header", () => {
    expect(parseRetryAfterMs(retryAfterResponse())).toBeNull();
    expect(parseRetryAfterMs(retryAfterResponse(""))).toBeNull();
    expect(parseRetryAfterMs(retryAfterResponse("0"))).toBeNull();
    expect(parseRetryAfterMs(retryAfterResponse("soon"))).toBeNull();
  });

  it("clamps a huge delta-seconds value to RETRY_AFTER_MAX_MS", () => {
    expect(parseRetryAfterMs(retryAfterResponse("3600"))).toBe(RETRY_AFTER_MAX_MS);
    expect(parseRetryAfterMs(retryAfterResponse(String(RETRY_AFTER_MAX_MS)))).toBe(RETRY_AFTER_MAX_MS);
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

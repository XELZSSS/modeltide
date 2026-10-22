import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  NEWS_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  ttlFor,
  ttlForRatio,
} from "./time";

describe("ttlFor", () => {
  it("returns the nominal TTL for a complete payload", () => {
    expect(ttlFor(false, STATIC_TTL_MS)).toBe(STATIC_TTL_MS);
    expect(ttlFor(false)).toBe(DEFAULT_TTL_MS);
  });

  it("shortens a degraded payload to a sixth of its TTL", () => {
    expect(ttlFor(true, STATIC_TTL_MS)).toBe(STATIC_TTL_MS / 6);
    expect(ttlFor(true, SLOW_TTL_MS)).toBe(SLOW_TTL_MS / 6);
  });

  it("never drops below the partial floor, so a retry cannot hammer upstream", () => {
    expect(ttlFor(true, DEFAULT_TTL_MS)).toBe(PARTIAL_FAIL_TTL_MS);
    expect(ttlFor(true, DEFAULT_TTL_MS / 2)).toBe(PARTIAL_FAIL_TTL_MS);
  });

  it("keeps a TTL that is already below the floor", () => {
    const tiny = PARTIAL_FAIL_TTL_MS / 2;
    expect(ttlFor(true, tiny)).toBe(tiny);
  });

  it("never exceeds the nominal TTL", () => {
    expect(ttlFor(true, NEWS_TTL_MS)).toBeLessThanOrEqual(NEWS_TTL_MS);
  });
});

describe("ttlForRatio", () => {
  it("keeps the nominal TTL while failures stay under one third", () => {
    expect(ttlForRatio(0, 4, STATIC_TTL_MS)).toBe(STATIC_TTL_MS);
    expect(ttlForRatio(1, 4, STATIC_TTL_MS)).toBe(STATIC_TTL_MS);
  });

  it("degrades once failures reach one third of the legs", () => {
    expect(ttlForRatio(2, 4, STATIC_TTL_MS)).toBe(STATIC_TTL_MS / 6);
    expect(ttlForRatio(1, 3, STATIC_TTL_MS)).toBe(STATIC_TTL_MS / 6);
  });

  it("treats an empty leg set as healthy", () => {
    expect(ttlForRatio(0, 0, STATIC_TTL_MS)).toBe(STATIC_TTL_MS);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  isRetiredRankEntry,
  NEWS_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  servedRankEntries,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
  todayIso,
  ttlFor,
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

describe("isRetiredRankEntry", () => {
  it("serves a row through the day before its expiry", () => {
    expect(isRetiredRankEntry(null, "2026-01-01")).toBe(false);
    expect(isRetiredRankEntry("2026-01-02", "2026-01-01")).toBe(false);
  });

  it("retires a row on its expiry day, not the day after", () => {
    expect(isRetiredRankEntry("2026-01-01", "2026-01-01")).toBe(true);
    expect(isRetiredRankEntry("2025-12-31", "2026-01-01")).toBe(true);
  });

  it("reads today as the upstream's UTC day", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIso()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("servedRankEntries", () => {
  const rows = [
    { id: "live", expiresAt: null },
    { id: "later", expiresAt: "2026-02-01" },
    { id: "gone", expiresAt: "2026-01-01" },
  ];

  it("drops only the rows past their serving window", () => {
    expect(servedRankEntries(rows, "2026-01-15").map((row) => row.id)).toEqual(["live", "later"]);
  });

  it("keeps the served rows in their delivered order, so no rank shifts under them", () => {
    expect(servedRankEntries(rows, "2026-01-15").map((row) => row.id)).toEqual(["live", "later"]);
  });

  it("returns nothing once every dated row is past its window", () => {
    const dated = [
      { id: "a", expiresAt: "2026-01-01" },
      { id: "b", expiresAt: "2026-02-01" },
    ];
    expect(servedRankEntries(dated, "2026-03-01")).toEqual([]);
  });
});

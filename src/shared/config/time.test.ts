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

/** The upstream's day in the retirement cases: one row expires on it, one before it, one after it. */
const TODAY = "2026-01-01";
/** A day every row in `rows` is still inside its serving window. */
const SERVING_DAY = "2026-01-15";

const TTL_CASES: ReadonlyArray<[name: string, partial: boolean, normalTtl: number | undefined, expected: number]> = [
  ["a complete payload keeps its TTL", false, STATIC_TTL_MS, STATIC_TTL_MS],
  ["a complete payload without a TTL keeps the default one", false, undefined, DEFAULT_TTL_MS],
  ["a degraded payload is shortened to a sixth", true, STATIC_TTL_MS, STATIC_TTL_MS / 6],
  ["a degraded slow payload is shortened to a sixth", true, SLOW_TTL_MS, SLOW_TTL_MS / 6],
  ["a degraded default TTL never drops below the partial floor", true, DEFAULT_TTL_MS, PARTIAL_FAIL_TTL_MS],
  ["a degraded half-default TTL never drops below the partial floor", true, DEFAULT_TTL_MS / 2, PARTIAL_FAIL_TTL_MS],
  ["a TTL already below the floor is kept", true, PARTIAL_FAIL_TTL_MS / 2, PARTIAL_FAIL_TTL_MS / 2],
  ["a degraded news TTL never exceeds the nominal one", true, NEWS_TTL_MS, PARTIAL_FAIL_TTL_MS],
];

const RETIREMENT_CASES: ReadonlyArray<[name: string, expiresAt: string | null, today: string, retired: boolean]> = [
  ["serves a row with no expiry at all", null, TODAY, false],
  ["serves a row through the day before its expiry", "2026-01-02", TODAY, false],
  ["retires a row on its expiry day, not the day after", TODAY, TODAY, true],
  ["retires a row whose window closed earlier", "2025-12-31", TODAY, true],
];

describe("ttlFor", () => {
  it.each(TTL_CASES)("%s", (_name, partial, normalTtl, expected) => {
    expect(ttlFor(partial, normalTtl)).toBe(expected);
  });
});

describe("isRetiredRankEntry", () => {
  it.each(RETIREMENT_CASES)("%s", (_name, expiresAt, today, retired) => {
    expect(isRetiredRankEntry(expiresAt, today)).toBe(retired);
  });

  it("reads today as the upstream's UTC day", () => {
    expect(todayIso()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("servedRankEntries", () => {
  const rows = [
    { id: "live", expiresAt: null },
    { id: "later", expiresAt: "2026-02-01" },
    { id: "gone", expiresAt: TODAY },
  ];
  const servedIds = (today: string): string[] => servedRankEntries(rows, today).map((row) => row.id);

  it("drops only the rows past their serving window and keeps the delivered order", () => {
    expect(servedIds(SERVING_DAY)).toEqual(["live", "later"]);
  });

  it("returns nothing once every dated row is past its window", () => {
    const dated = [
      { id: "a", expiresAt: TODAY },
      { id: "b", expiresAt: "2026-02-01" },
    ];
    expect(servedRankEntries(dated, "2026-03-01")).toEqual([]);
  });
});

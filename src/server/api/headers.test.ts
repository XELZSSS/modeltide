import { describe, expect, it } from "vitest";
import { CACHE_VERSION, CONTRACT_VERSION } from "@/shared/config/cache-version.gen.ts";
import {
  applyApiHeaders,
  cacheDurationsForTtl,
  ifNoneMatchSatisfied,
  payloadEtag,
  renderCacheSpec,
  renderPartialCacheSpec,
  type CacheSpec,
} from "./headers";

const FETCHED_AT = "2026-01-01T00:00:00.000Z";
const ONE_HOUR_MS = 60 * 60_000;
const CONTRACT_VERSION_HEADER = "X-Contract-Version";
/** A route-level policy that withholds `stale-if-error`, as the Hugging Face by-id miss does. */
const WITHHOLDING_DURATIONS = { browserMaxAgeS: 30, cdnMaxAgeS: 60, swrCapS: 60 };

/** The row-count suffix is the only difference between the two payload shapes below. */
const ETAG_CASES: ReadonlyArray<[title: string, variant: Parameters<typeof payloadEtag>[1], expected: string]> = [
  ["identifies a payload by fetch time and row count", { rows: 194 }, `W/"${FETCHED_AT}-194"`],
  ["omits the row-count suffix for a non-list payload", {}, `W/"${FETCHED_AT}"`],
];

const TTL_CASES: ReadonlyArray<[title: string, ttlMs: number, expected: CacheSpec]> = [
  [
    "gives the browser half of the server TTL and the CDN the full window",
    10 * 60_000,
    { browser: "public, max-age=300", cdn: "public, max-age=600, stale-while-revalidate=300, stale-if-error=86400" },
  ],
  [
    "caps both windows at 30 minutes",
    ONE_HOUR_MS,
    {
      browser: "public, max-age=900",
      cdn: "public, max-age=1800, stale-while-revalidate=300, stale-if-error=86400",
    },
  ],
  [
    "keeps the browser window at least 30s for a short TTL",
    30_000,
    { browser: "public, max-age=30", cdn: "public, max-age=30, stale-while-revalidate=30, stale-if-error=86400" },
  ],
];

/** Runs `applyApiHeaders` on a fresh `Headers`, the setup the assertions at the bottom share. */
function appliedHeaders(): Headers {
  const headers = new Headers();
  applyApiHeaders(headers);
  return headers;
}

describe("cacheDurationsForTtl", () => {
  it.each(TTL_CASES)("%s", (_title, ttlMs, expected) => {
    expect(renderCacheSpec(cacheDurationsForTtl(ttlMs))).toEqual(expected);
  });

  it.each([0, Number.NaN])("falls back to the default window for the unusable TTL %s", (ttlMs) => {
    expect(cacheDurationsForTtl(ttlMs)).toEqual(cacheDurationsForTtl(60_000));
  });
});

describe("renderPartialCacheSpec", () => {
  it("tightens both freshness windows while keeping the stale-if-error window", () => {
    expect(renderPartialCacheSpec(cacheDurationsForTtl(ONE_HOUR_MS))).toEqual({
      browser: "public, max-age=30",
      cdn: "public, max-age=60, stale-while-revalidate=60, stale-if-error=86400",
    });
  });

  it("never grants stale-if-error to a policy that withheld it", () => {
    expect(renderCacheSpec(WITHHOLDING_DURATIONS).cdn).not.toContain("stale-if-error");
    expect(renderPartialCacheSpec(WITHHOLDING_DURATIONS).cdn).not.toContain("stale-if-error");
  });
});

describe("payloadEtag", () => {
  it.each(ETAG_CASES)("%s", (_title, variant, expected) => {
    expect(payloadEtag(FETCHED_AT, variant)).toBe(expected);
  });

  // `?v=` already keeps a new deploy on a different URL, so no build id belongs in the tag.
  it("carries no build id", () => {
    expect(payloadEtag(FETCHED_AT, { rows: 1 })).not.toContain(CACHE_VERSION);
  });

  it("changes with the row count, so a shrinking list revalidates", () => {
    expect(payloadEtag(FETCHED_AT, { rows: 1 })).not.toBe(payloadEtag(FETCHED_AT, { rows: 2 }));
  });

  it("changes when the payload degrades, so a 304 never hides the stale fallback", () => {
    const fresh = payloadEtag(FETCHED_AT, { rows: 7 });
    const degraded = payloadEtag(FETCHED_AT, { rows: 7, partial: true });
    expect(degraded).not.toBe(fresh);
    expect(ifNoneMatchSatisfied(`"${fresh.replace(/^W\//, "")}"`, degraded)).toBe(false);
  });
});

describe("ifNoneMatchSatisfied", () => {
  const etag = 'W/"abc-1"';

  it.each<[title: string, ifNoneMatch: string | null, expected: boolean]>([
    ["matches the same validator in weak form", 'W/"abc-1"', true],
    ["matches the same validator in strong form", '"abc-1"', true],
    ["matches any entry of a comma-separated list", 'W/"other", W/"abc-1"', true],
    ["matches the wildcard", "*", true],
    ["rejects a different validator", 'W/"abc-2"', false],
    ["rejects a missing header", null, false],
  ])("%s", (_title, ifNoneMatch, expected) => {
    expect(ifNoneMatchSatisfied(ifNoneMatch, etag)).toBe(expected);
  });
});

describe("applyApiHeaders", () => {
  // The API serves same-origin readers, so no CORS headers ride along.
  it("advertises only the payload contract version", () => {
    const headers = appliedHeaders();
    expect(headers.get(CONTRACT_VERSION_HEADER)).toBe(CONTRACT_VERSION);
    expect([...headers.keys()]).toEqual(["x-contract-version"]);
    // The cache version moves for reasons a client cannot act on.
    expect(headers.get(CONTRACT_VERSION_HEADER)).not.toBe(CACHE_VERSION);
  });
});

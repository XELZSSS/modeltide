import { describe, expect, it } from "vitest";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";
import { applyApiHeaders, cacheHeadersForTtl, ifNoneMatchSatisfied, payloadEtag } from "./headers";

const FETCHED_AT = "2026-01-01T00:00:00.000Z";

describe("cacheHeadersForTtl", () => {
  it("gives the browser half of the server TTL and the CDN the full window", () => {
    expect(cacheHeadersForTtl(10 * 60_000)).toEqual({
      browser: "public, max-age=300",
      cdn: "public, max-age=600, stale-while-revalidate=300, stale-if-error=86400",
    });
  });

  it("caps both windows at 30 minutes", () => {
    const headers = cacheHeadersForTtl(60 * 60_000);
    expect(headers.browser).toBe("public, max-age=900");
    expect(headers.cdn.startsWith("public, max-age=1800,")).toBe(true);
  });

  it("keeps the browser window at least 30s and falls back to the default window for an unusable TTL", () => {
    expect(cacheHeadersForTtl(30_000).browser).toBe("public, max-age=30");
    expect(cacheHeadersForTtl(0)).toEqual(cacheHeadersForTtl(60_000));
    expect(cacheHeadersForTtl(Number.NaN)).toEqual(cacheHeadersForTtl(60_000));
  });
});

describe("payloadEtag", () => {
  it("identifies a payload by fetch time and row count", () => {
    expect(payloadEtag(FETCHED_AT, { rows: 194 })).toBe(`W/"${FETCHED_AT}-194"`);
  });

  it("omits the row-count suffix for a non-list payload", () => {
    expect(payloadEtag(FETCHED_AT)).toBe(`W/"${FETCHED_AT}"`);
  });

  it("carries no build id: `?v=` already keeps a new deploy on a different URL", () => {
    expect(payloadEtag(FETCHED_AT, { rows: 1 })).not.toContain(CACHE_VERSION);
  });

  it("changes with the row count so a shrinking list revalidates", () => {
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

  it("matches the same validator in weak and strong form", () => {
    expect(ifNoneMatchSatisfied('W/"abc-1"', etag)).toBe(true);
    expect(ifNoneMatchSatisfied('"abc-1"', etag)).toBe(true);
  });

  it("matches any entry of a comma-separated list", () => {
    expect(ifNoneMatchSatisfied('W/"other", W/"abc-1"', etag)).toBe(true);
  });

  it("accepts the wildcard", () => {
    expect(ifNoneMatchSatisfied("*", etag)).toBe(true);
  });

  it("rejects a different validator or a missing header", () => {
    expect(ifNoneMatchSatisfied('W/"abc-2"', etag)).toBe(false);
    expect(ifNoneMatchSatisfied(null, etag)).toBe(false);
  });
});

describe("applyApiHeaders", () => {
  it("advertises the build id only: the API serves same-origin readers, so no CORS headers ride along", () => {
    const headers = new Headers();
    applyApiHeaders(headers);
    expect(headers.get("X-Contract-Version")).toBe(CACHE_VERSION);
    expect([...headers.keys()]).toEqual(["x-contract-version"]);
  });
});

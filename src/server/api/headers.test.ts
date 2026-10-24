import { describe, expect, it } from "vitest";
import { CACHE_VERSION, CONTRACT_VERSION } from "@/shared/config/cache-version.gen.ts";
import {
  applyApiHeaders,
  cacheDurationsForTtl,
  ifNoneMatchSatisfied,
  payloadEtag,
  renderCacheSpec,
  renderPartialCacheSpec,
} from "./headers";

const FETCHED_AT = "2026-01-01T00:00:00.000Z";

describe("cacheDurationsForTtl", () => {
  it("gives the browser half of the server TTL and the CDN the full window", () => {
    expect(renderCacheSpec(cacheDurationsForTtl(10 * 60_000))).toEqual({
      browser: "public, max-age=300",
      cdn: "public, max-age=600, stale-while-revalidate=300, stale-if-error=86400",
    });
  });

  it("caps both windows at 30 minutes", () => {
    const spec = renderCacheSpec(cacheDurationsForTtl(60 * 60_000));
    expect(spec.browser).toBe("public, max-age=900");
    expect(spec.cdn.startsWith("public, max-age=1800,")).toBe(true);
  });

  it("keeps the browser window at least 30s and falls back to the default window for an unusable TTL", () => {
    expect(renderCacheSpec(cacheDurationsForTtl(30_000)).browser).toBe("public, max-age=30");
    expect(cacheDurationsForTtl(0)).toEqual(cacheDurationsForTtl(60_000));
    expect(cacheDurationsForTtl(Number.NaN)).toEqual(cacheDurationsForTtl(60_000));
  });
});

describe("renderPartialCacheSpec", () => {
  it("tightens both freshness windows while keeping the stale-if-error window", () => {
    expect(renderPartialCacheSpec(cacheDurationsForTtl(60 * 60_000))).toEqual({
      browser: "public, max-age=30",
      cdn: "public, max-age=60, stale-while-revalidate=60, stale-if-error=86400",
    });
  });

  it("never grants stale-if-error to a policy that withheld it, as the Hugging Face by-id miss does", () => {
    const miss = { browserMaxAgeS: 30, cdnMaxAgeS: 60, swrCapS: 60 };
    expect(renderCacheSpec(miss).cdn).not.toContain("stale-if-error");
    expect(renderPartialCacheSpec(miss).cdn).not.toContain("stale-if-error");
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
  it("advertises the payload contract version only: the API serves same-origin readers, so no CORS headers ride along", () => {
    const headers = new Headers();
    applyApiHeaders(headers);
    expect(headers.get("X-Contract-Version")).toBe(CONTRACT_VERSION);
    expect([...headers.keys()]).toEqual(["x-contract-version"]);
  });

  it("never advertises the cache version, which moves for reasons a client cannot act on", () => {
    const headers = new Headers();
    applyApiHeaders(headers);
    expect(headers.get("X-Contract-Version")).not.toBe(CACHE_VERSION);
  });
});

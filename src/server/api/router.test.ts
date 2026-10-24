import { describe, expect, it } from "vitest";
import { handleApiRoute, type ApiRouteDef } from "./router";
import { API_VERSION_PARAM } from "@/shared/config/api";
import { cacheDurationsForTtl } from "./headers";
import { ClientAbortError, UpstreamError } from "./errors";

function route(overrides: Partial<ApiRouteDef> = {}): ApiRouteDef {
  return {
    cache: cacheDurationsForTtl(30 * 60_000),
    handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: false }),
    ...overrides,
  };
}

async function call(query: string, def: ApiRouteDef = route()): Promise<Response> {
  const url = new URL(`http://localhost/api/test${query}`);
  return handleApiRoute(new Request(url), {}, url, def);
}

describe("handleApiRoute query validation", () => {
  it("accepts a declared param and the contract version param", async () => {
    const res = await call(
      `?sort=trendingScore&${API_VERSION_PARAM}=sha-abc`,
      route({ query: { sort: { type: "enum", values: ["trendingScore"], default: "trendingScore" } } }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unknown param instead of ignoring it", async () => {
    const res = await call("?direction=-1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("direction");
  });

  it("rejects unknown params even when a valid one is present", async () => {
    const res = await call(`?sort=trendingScore&direction=-1&${API_VERSION_PARAM}=sha-abc`);
    expect(res.status).toBe(400);
  });

  it("strips control characters from the reported param names", async () => {
    const res = await call("?%00bad=1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("\u0000");
  });
});

describe("handleApiRoute error mapping", () => {
  function failing(err: unknown): ApiRouteDef {
    return route({
      handler: () => Promise.reject(err),
    });
  }

  it("answers a rate-limited upstream with 503 + Retry-After instead of a generic 502", async () => {
    const res = await call("", failing(new UpstreamError("HTTP 429", { status: 429, retryAfterMs: 3_000 })));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("falls back to a sane Retry-After when the upstream sends none", async () => {
    const res = await call("", failing(new UpstreamError("HTTP 429", { status: 429 })));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("keeps a non-429 upstream failure on the 502 path", async () => {
    const res = await call("", failing(new UpstreamError("HTTP 500", { status: 500 })));
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("reports a timeout as 504 and a hung-up caller as 499", async () => {
    const timedOut = await call("", failing(new UpstreamError("slow", { timeout: true })));
    expect(timedOut.status).toBe(504);
    const aborted = await call("", failing(new ClientAbortError("gone")));
    expect(aborted.status).toBe(499);
  });
});

describe("handleApiRoute validators", () => {
  it("revalidates when a payload degrades, so a 304 cannot hide the stale fallback", async () => {
    const fresh = route({
      handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: false }),
    });
    const first = await call("", fresh);
    const etag = first.headers.get("ETag");
    expect(etag).not.toBeNull();

    const degraded = route({
      handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: true }),
    });
    const url = new URL("http://localhost/api/test");
    const res = await handleApiRoute(
      new Request(url, { headers: { "if-none-match": etag as string } }),
      {},
      url,
      degraded,
    );
    expect(res.status).toBe(200);
  });

  it("answers 304 for an unchanged payload", async () => {
    const def = route({
      handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: false }),
    });
    const etag = (await call("", def)).headers.get("ETag") as string;
    const url = new URL("http://localhost/api/test");
    const res = await handleApiRoute(new Request(url, { headers: { "if-none-match": etag } }), {}, url, def);
    expect(res.status).toBe(304);
  });

  it("keeps a route's stale-if-error refusal when the payload degrades", async () => {
    const res = await call(
      "",
      route({
        cache: { browserMaxAgeS: 30, cdnMaxAgeS: 60, swrCapS: 60 },
        handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: true }),
      }),
    );
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(res.headers.get("CDN-Cache-Control")).not.toContain("stale-if-error");
  });
});

import { describe, expect, it } from "vitest";
import { handleApiRoute, type ApiRouteDef } from "./router";
import { API_VERSION_PARAM } from "@/shared/config/api";
import type { ApiErrorBody } from "@/shared/types/api-error";
import { cacheDurationsForTtl } from "./headers";
import { ClientAbortError, UpstreamError } from "./errors";
import { served } from "@/server/served-payload";

/**
 * Stands in for the pipeline, which is what stamps a payload in production. The fixed moment keeps two calls to the
 * same handler comparable, which is what the ETag tests turn on.
 */
const STAMPED_AT = Date.parse("2026-01-01T00:00:00.000Z");
const payloadOf = (partial: boolean) => served({ data: [], partial }, { producedAt: STAMPED_AT });

const API_TEST_URL = "http://localhost/api/test";
const VERSIONED_SORT_QUERY = `?sort=trendingScore&${API_VERSION_PARAM}=sha-abc`;
const UNKNOWN_ALONGSIDE_VALID_QUERY = `?sort=trendingScore&direction=-1&${API_VERSION_PARAM}=sha-abc`;

function route(overrides: Partial<ApiRouteDef> = {}): ApiRouteDef {
  return {
    domain: "artificialIndex",
    cache: cacheDurationsForTtl(30 * 60_000),
    handler: async () => payloadOf(false),
    ...overrides,
  };
}

/** The route whose only declared param is `sort`; the contract version rides along with every query. */
const SORT_ROUTE = route({
  query: { sort: { type: "enum", values: ["trendingScore"], default: "trendingScore" } },
});

async function call(query: string, def: ApiRouteDef = route()): Promise<Response> {
  const url = new URL(`${API_TEST_URL}${query}`);
  return handleApiRoute(new Request(url), {}, url, def);
}

describe("handleApiRoute query validation", () => {
  it.each([
    ["accepts a declared param and the contract version param", VERSIONED_SORT_QUERY, SORT_ROUTE, 200],
    ["rejects unknown params even when a valid one is present", UNKNOWN_ALONGSIDE_VALID_QUERY, route(), 400],
  ] as const)("%s", async (_name, query, def, expectedStatus) => {
    const res = await call(query, def);
    expect(res.status).toBe(expectedStatus);
  });

  it.each<[title: string, query: string, check: (message: string) => void]>([
    ["names the rejected param", "?direction=-1", (message) => expect(message).toContain("direction")],
    [
      "strips control characters from the reported param names",
      "?%00bad=1",
      (message) => expect(message).not.toContain("\u0000"),
    ],
  ])("%s", async (_title, query, check) => {
    const res = await call(query);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    check(body.error.message);
    expect(body.error).toMatchObject({ kind: "validation", source: "artificialIndex" });
  });
});

describe("handleApiRoute error mapping", () => {
  function failing(err: unknown): ApiRouteDef {
    return route({
      handler: () => Promise.reject(err),
    });
  }

  it.each<
    [
      title: string,
      err: unknown,
      expectedStatus: number,
      expectedRetryAfter: string | null,
      expected: Partial<ApiErrorBody["error"]>,
    ]
  >([
    [
      "answers a rate-limited upstream with 503 + Retry-After instead of a generic 502",
      new UpstreamError("HTTP 429", { status: 429, retryAfterMs: 3_000 }),
      503,
      "3",
      { kind: "rate-limited" },
    ],
    [
      "falls back to a sane Retry-After when the upstream sends none",
      new UpstreamError("HTTP 429", { status: 429 }),
      503,
      "60",
      { kind: "rate-limited" },
    ],
    [
      "keeps a non-429 upstream failure on the 502 path, naming the status the upstream answered with",
      new UpstreamError("HTTP 500", { status: 500 }),
      502,
      null,
      { kind: "upstream-unavailable", upstreamStatus: 500 },
    ],
  ])("%s", async (_title, err, expectedStatus, expectedRetryAfter, expected) => {
    const res = await call("", failing(err));
    expect(res.status).toBe(expectedStatus);
    expect(res.headers.get("Retry-After")).toBe(expectedRetryAfter);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(((await res.json()) as ApiErrorBody).error).toMatchObject({ ...expected, source: "artificialIndex" });
  });

  it.each([
    ["a timeout as 504", 504, "timeout", new UpstreamError("slow", { timeout: true })],
    ["a hung-up caller as 499", 499, "client-abort", new ClientAbortError("gone")],
  ] as const)("%s", async (_case, expectedStatus, expectedKind, err) => {
    const res = await call("", failing(err));
    expect(res.status).toBe(expectedStatus);
    expect(((await res.json()) as ApiErrorBody).error.kind).toBe(expectedKind);
  });
});

describe("handleApiRoute validators", () => {
  it.each([
    ["revalidates when a payload degrades, so a 304 cannot hide the stale fallback", true, 200],
    ["answers 304 for an unchanged payload", false, 304],
  ] as const)("%s", async (_title, degraded, expectedStatus) => {
    const fresh = route();
    const etag = (await call("", fresh)).headers.get("ETag");
    expect(etag).not.toBeNull();

    const def = degraded ? route({ handler: async () => payloadOf(true) }) : fresh;
    const url = new URL(API_TEST_URL);
    const res = await handleApiRoute(new Request(url, { headers: { "if-none-match": etag as string } }), {}, url, def);
    expect(res.status).toBe(expectedStatus);
  });

  it("keeps a route's stale-if-error refusal when the payload degrades", async () => {
    const res = await call(
      "",
      route({
        cache: { browserMaxAgeS: 30, cdnMaxAgeS: 60, swrCapS: 60 },
        handler: async () => payloadOf(true),
      }),
    );
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(res.headers.get("CDN-Cache-Control")).not.toContain("stale-if-error");
  });
});

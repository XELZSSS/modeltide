import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import worker from "@/server/worker";
import { createApp } from "@/server/api";
import { buildWarmUrls, defineRoute, type RouteDef } from "@/server/routes";
import {
  CacheService,
  HttpClient,
  UpstreamError,
  ValidationError,
  qEnum,
  qNum,
  resetModuleCachesForTests,
  validateQuery,
} from "@/server/infra";
import { upstreamConfig } from "@/shared/config";
import type { Env } from "@/server/context";

// Consolidated server-core tests (workerd runtime): KV cache, HTTP client,
// query validation, route registry (headers, defaults, rate limiting, warmup)
// plus end-to-end Worker API tests with mocked upstreams.

describe("CacheService (KV backend in workerd)", () => {
  beforeEach(async () => {
    await reset();
    resetModuleCachesForTests();
  });

  it("persists values through the real KV binding", async () => {
    const cache = new CacheService(env.CACHE!, "v1");
    const fn = vi.fn(async () => ({ data: { a: 1 } }));

    expect(await cache.withTtl("kv-int", 60_000, fn)).toEqual({ a: 1 });
    expect(await cache.withTtl("kv-int", 60_000, fn)).toEqual({ a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stores values under versioned keys in KV", async () => {
    const v1 = new CacheService(env.CACHE!, "v1");
    const v2 = new CacheService(env.CACHE!, "v2");
    const fn = vi.fn(async () => ({ data: "x" }));

    await v1.withTtl("shared", 60_000, fn);
    await v2.withTtl("shared", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);

    await v1.withTtl("shared", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent fetches for the same key", async () => {
    const cache = new CacheService(env.CACHE!, "v1");
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { data: "v" };
    });
    const [a, b] = await Promise.all([cache.withTtl("same", 60_000, fn), cache.withTtl("same", 60_000, fn)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(calls).toBe(1);
  });

  it("coalesces concurrent refreshes across per-request instances", async () => {
    // buildContext constructs one CacheService per request, so cross-request
    // bursts only dedupe via the shared module-level inflight map.
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { data: "v" };
    });
    const [a, b] = await Promise.all([
      new CacheService(env.CACHE!, "v1").withTtl("shared-inst", 60_000, fn),
      new CacheService(env.CACHE!, "v1").withTtl("shared-inst", 60_000, fn),
    ]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(calls).toBe(1);
  });

  it("serves stale data when a soft-expired refresh fails", async () => {
    const cache = new CacheService(env.CACHE!, "v1");
    await cache.withTtl("stale", -1, async () => ({ data: "fresh" }));
    const result = await cache.withTtl("stale", -1, async () => {
      throw new Error("upstream down");
    });
    expect(result).toBe("fresh");
  });

  it("treats corrupted KV entries as a miss so the key self-heals", async () => {
    await env.CACHE!.put("v1:corrupt", "not-json{{{");
    const cache = new CacheService(env.CACHE!, "v1");
    const fn = vi.fn(async () => ({ data: "healed" }));
    expect(await cache.withTtl("corrupt", 60_000, fn)).toBe("healed");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("HttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries transient 5xx failures and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await new HttpClient({ retries: 1 }).json<{ ok: boolean }>("https://upstream.test/api");
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats client errors as permanent UpstreamError without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal("fetch", fetchMock);

    const err = await new HttpClient({ retries: 2 }).json("https://upstream.test/api").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries on repeated 5xx and throws UpstreamError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new HttpClient({ retries: 1 }).json("https://upstream.test/api")).rejects.toBeInstanceOf(
      UpstreamError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws UpstreamError when the upstream body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    await expect(new HttpClient().json("https://upstream.test/api")).rejects.toThrowError(/invalid JSON/);
  });

  it("rejects oversized JSON payloads without buffering them", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: 200, headers: { "content-length": String(6 * 1024 * 1024) } })),
    );
    await expect(new HttpClient().json("https://upstream.test/api")).rejects.toThrowError(/too large/);
  });

  it("maps body read failures to UpstreamError instead of raw errors", async () => {
    const failingText = new Response("x", { status: 200 });
    failingText.text = () => Promise.reject(new Error("Network connection lost"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failingText));
    const err = await new HttpClient().text("https://upstream.test/page").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).status).toBe(502);
  });

  it("probe reports success with status and latency", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const result = await new HttpClient().probe("https://upstream.test");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("probe reports failure status and network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const failed = await new HttpClient().probe("https://upstream.test");
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe("HTTP 503");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const networkError = await new HttpClient().probe("https://upstream.test");
    expect(networkError.ok).toBe(false);
    expect(networkError.status).toBeNull();
    expect(networkError.error).toBe("network error");
  });
});

describe("validateQuery", () => {
  it("applies defaults when the param is missing", () => {
    const out = validateQuery({}, { sort: { type: "enum", values: ["a", "b"], default: "a" } });
    expect(out.sort).toBe("a");
  });

  it.each(["", "   "])("treats blank params (case %#) as absent and applies the default", (blank) => {
    const out = validateQuery(
      { limit: blank, sort: blank },
      { limit: { type: "number", default: "25", min: 1 }, sort: { type: "enum", values: ["a", "b"], default: "a" } },
    );
    expect(out.limit).toBe(25);
    expect(out.sort).toBe("a");
  });

  it("omits empty-string params without a default", () => {
    const out = validateQuery({ limit: "" }, { limit: { type: "number" } });
    expect(out).toEqual({});
  });

  it("keeps provided values", () => {
    const out = validateQuery({ sort: "b" }, { sort: { type: "enum", values: ["a", "b"] } });
    expect(out.sort).toBe("b");
  });

  it("normalizes number params to numbers", () => {
    const out = validateQuery({ limit: "42" }, { limit: { type: "number", min: 1, max: 100 } });
    expect(out.limit).toBe(42);
  });

  it("rejects out-of-range numbers", () => {
    expect(() => validateQuery({ limit: "101" }, { limit: { type: "number", min: 1, max: 100 } })).toThrowError(
      ValidationError,
    );
    expect(() => validateQuery({ limit: "0" }, { limit: { type: "number", min: 1, max: 100 } })).toThrowError(
      ValidationError,
    );
  });

  it("rejects non-numeric number params", () => {
    expect(() => validateQuery({ limit: "abc" }, { limit: { type: "number" } })).toThrowError(ValidationError);
  });

  it("rejects values outside the enum", () => {
    expect(() => validateQuery({ cat: "x" }, { cat: { type: "enum", values: ["a", "b"] } })).toThrowError(
      ValidationError,
    );
  });

  it("omits unknown params", () => {
    const out = validateQuery({ extra: "1" }, {});
    expect(out).toEqual({});
  });

  it("rejects values longer than 500 chars", () => {
    expect(() =>
      validateQuery({ q: "x".repeat(501) }, { q: { type: "enum", values: ["a", "b"], default: "a" } }),
    ).toThrowError(ValidationError);
  });

  it("takes the first value of repeated params", () => {
    const out = validateQuery({ sort: ["b", "a"] }, { sort: { type: "enum", values: ["a", "b"] } });
    expect(out.sort).toBe("b");
  });
});
const fakeEnv = { CACHE: { get: async () => null, put: async () => {} } } as unknown as Env;

const registryApp = createApp([
  defineRoute({ path: "/api/cached", handler: async () => ({ ok: true }) }),
  defineRoute({ path: "/api/live", noStore: true, handler: async () => ({ ok: true }) }),
  defineRoute({
    path: "/api/params",
    query: { n: qNum({ default: "5", min: 1, max: 10 }) },
    handler: async (_ctx, params) => params,
  }),
]);

describe("route registry", () => {
  it("stamps short browser and longer CDN cache headers on cacheable routes", async () => {
    const res = await registryApp.request("/api/cached", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("CDN-Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400",
    );
    expect(res.headers.get("Vary")).toBe("Accept, Accept-Encoding");
  });

  it("marks live-state routes as no-store on both browser and CDN layers", async () => {
    const res = await registryApp.request("/api/live", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("wraps handler payloads in the data envelope and applies query defaults", async () => {
    const res = await registryApp.request("/api/params", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { n: 5 } });
  });

  it("rejects out-of-range numeric params with a 400 envelope", async () => {
    const res = await registryApp.request("/api/params?n=99", {}, fakeEnv);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(400);
  });
});

function statefulEnv(): Env {
  const store = new Map<string, string>();
  return {
    CACHE: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    },
  } as unknown as Env;
}

const rateLimitedApp = createApp([
  defineRoute({ path: "/api/limited", rateLimit: { windowSec: 60, max: 2 }, handler: async () => ({ ok: true }) }),
]);

describe("route rate limiting", () => {
  it("allows up to max requests per window per IP, then returns 429", async () => {
    const envState = statefulEnv();
    const init = { headers: { "CF-Connecting-IP": "203.0.113.7" } };
    expect((await rateLimitedApp.request("/api/limited", init, envState)).status).toBe(200);
    expect((await rateLimitedApp.request("/api/limited", init, envState)).status).toBe(200);
    const blocked = await rateLimitedApp.request("/api/limited", init, envState);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: { code: number } };
    expect(body.error.code).toBe(429);
  });

  it("keys the budget per client IP", async () => {
    const envState = statefulEnv();
    const other = { headers: { "CF-Connecting-IP": "198.51.100.9" } };
    expect((await rateLimitedApp.request("/api/limited", other, envState)).status).toBe(200);
  });

  it("skips limiting when no client IP header is present (local dev / tests)", async () => {
    const envState = statefulEnv();
    for (let i = 0; i < 3; i++) {
      expect((await rateLimitedApp.request("/api/limited", {}, envState)).status).toBe(200);
    }
  });
});

const warmRoutes: RouteDef[] = [
  {
    path: "/api/index",
    handler: async () => ({}),
  },
  {
    path: "/api/list",
    query: { sort: qEnum(["trending", "downloads"], "trending"), limit: qNum({ default: "500", min: 1, max: 500 }) },
    warm: "all",
    handler: async () => ({}),
  },
  {
    path: "/api/news",
    query: { category: qEnum(["industry", "funding"], "industry") },
    warm: "window",
    handler: async () => ({}),
  },
];

// newsWarmDue: getUTCMinutes() % 28 < 4 → minute 0 is inside the window, minute 10 is outside.
const due = new Date(Date.UTC(2026, 0, 1, 0, 0));
const notDue = new Date(Date.UTC(2026, 0, 1, 0, 10));

describe("buildWarmUrls", () => {
  it("expands warm routes into the enum cartesian product with defaults filled", () => {
    const urls = buildWarmUrls("https://api.test", warmRoutes, due);
    expect(urls).toContain("https://api.test/api/list?sort=trending&limit=500");
    expect(urls).toContain("https://api.test/api/list?sort=downloads&limit=500");
  });

  it("includes warmWindow routes only inside the warming window", () => {
    const dueUrls = buildWarmUrls("https://api.test", warmRoutes, due);
    expect(dueUrls).toContain("https://api.test/api/news?category=industry");
    expect(dueUrls).toContain("https://api.test/api/news?category=funding");

    const notDueUrls = buildWarmUrls("https://api.test", warmRoutes, notDue);
    expect(notDueUrls.some((u) => u.startsWith("https://api.test/api/news"))).toBe(false);
    expect(notDueUrls).toContain("https://api.test/api/list?sort=trending&limit=500");
  });

  it("emits a single defaults-only URL for non-warm routes", () => {
    expect(buildWarmUrls("https://api.test", [warmRoutes[0]!], due)).toEqual(["https://api.test/api/index"]);
  });

  it("skips noStore routes so live-state endpoints are never warmed", () => {
    const routes: RouteDef[] = [
      { path: "/api/live", noStore: true, handler: async () => ({}) },
      { path: "/api/cached", handler: async () => ({}) },
    ];
    const urls = buildWarmUrls("https://api.test", routes, due);
    expect(urls).toEqual(["https://api.test/api/cached"]);
  });

  it("rejects oversized URLs with a 400 envelope", async () => {
    const res = await registryApp.request(`/api/cached?x=${"y".repeat(2100)}`, {}, fakeEnv);
    expect(res.status).toBe(400);
  });
});

const OR = upstreamConfig.openrouter;

function mockUpstream(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/models") {
      return jsonResponse({
        data: [{ id: "openai/gpt-5", pricing: { prompt: "1", completion: "2", input_cache_read: "0.1" } }],
      });
    }
    if (url.pathname === "/api/frontend/v1/rankings/models") {
      return jsonResponse({
        data: [
          {
            date: "2026-08-01",
            model_permaslug: "openai/gpt-5",
            variant: "OpenAI GPT-5",
            variant_permaslug: "openai/gpt-5",
            total_prompt_tokens: 100,
            total_completion_tokens: 50,
            count: 10,
            change: 1,
          },
        ],
      });
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Worker API integration (workerd runtime)", () => {
  beforeEach(async () => {
    await reset();
    resetModuleCachesForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves /api/openrouter-rankings from a mocked upstream", async () => {
    const fetchMock = mockUpstream();

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        tokenUsageRankings: {
          name: string;
          creator: string;
          totalTokens: number;
          pricing: { prompt: number; input_cache_read: number };
        }[];
      };
    };
    expect(body.data.tokenUsageRankings).toHaveLength(1);
    const entry = body.data.tokenUsageRankings[0]!;
    expect(entry.name).toBe("GPT 5");
    expect(entry.creator).toBe("OpenAI");
    expect(entry.totalTokens).toBe(150);
    expect(entry.pricing.prompt).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("attaches pricing via canonical_slug for dated ranking slugs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/models") {
        return jsonResponse({
          data: [
            {
              id: "google/gemini-3.7-flash",
              canonical_slug: "google/gemini-3.7-flash-20260813",
              pricing: { prompt: "0.0000014", completion: "0.0000044", input_cache_read: "0.0000001" },
            },
          ],
        });
      }
      if (url.pathname === "/api/frontend/v1/rankings/models") {
        return jsonResponse({
          data: [
            {
              date: "2026-08-01",
              model_permaslug: "google/gemini-3.7-flash-20260813",
              variant: "standard",
              variant_permaslug: "google/gemini-3.7-flash-20260813",
              total_prompt_tokens: 100,
              total_completion_tokens: 50,
              count: 10,
              change: null,
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        tokenUsageRankings: {
          promptTokens: number;
          completionTokens: number;
          pricing?: { prompt: number; completion: number; input_cache_read: number };
        }[];
      };
    };
    const entry = body.data.tokenUsageRankings[0]!;
    expect(entry.promptTokens).toBe(100);
    expect(entry.completionTokens).toBe(50);
    expect(entry.pricing).toBeDefined();
    expect(entry.pricing?.prompt).toBeCloseTo(0.0000014);
    expect(entry.pricing?.completion).toBeCloseTo(0.0000044);
    expect(entry.pricing?.input_cache_read).toBeCloseTo(0.0000001);
  });

  it("serves repeated requests from the KV cache without refetching upstream", async () => {
    const fetchMock = mockUpstream();

    const url = new Request(`${OR}/api/openrouter-rankings`);
    const first = await worker.fetch(url, env);
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const res = await worker.fetch(new Request(`${OR}/api/nope`), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(404);
  });

  it("returns 400 JSON for invalid query params", async () => {
    const res = await worker.fetch(new Request(`${OR}/api/news?category=bogus`), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(400);
  });

  it("returns 502 JSON when the upstream is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(502);
    // Upstream details (URLs, statuses) stay server-side; clients get a generic message.
    expect(body.error.message).toBe("Upstream data source temporarily unavailable");
  });
});

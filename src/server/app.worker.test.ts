import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import worker from "@/server/worker";
import { createApp } from "@/server/api";
import { buildWarmUrls } from "@/server/routes/warmup";
import { defineRoute } from "@/server/routes/types";
import type { RouteDef } from "@/server/routes/types";
import { qEnum, qNum } from "@/server/infra/validate";
import { upstreamConfig } from "@/shared/config";
import type { Env } from "@/server/context";

// Consolidated server tests: route registry behavior (cache headers, query
// defaults, rate limiting, warmup expansion) plus end-to-end Worker API tests
// running inside the workerd test runtime with mocked upstreams.

// -- route registry -------------------------------------------------------------

// Minimal KV stub: registry tests never touch the cache, but buildContext wires it.
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

// -- rate limiting ----------------------------------------------------------------

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

// -- warmup -----------------------------------------------------------------------

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
});

// -- Worker API integration ------------------------------------------------------

const OR = upstreamConfig.openrouter;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
  });
});

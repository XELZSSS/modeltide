import { describe, expect, it } from "vitest";
import { createApp } from "@/server/api";
import { buildWarmUrls } from "@/server/routes/warmup";
import { defineRoute } from "@/server/routes/types";
import type { RouteDef } from "@/server/routes/types";
import { qEnum, qNum } from "@/server/infra/validate";
import type { Env } from "@/server/context";

// Consolidated tests for the route layer: registry cache-header stamping and cron warmup URL expansion.

// -- registry -----------------------------------------------------------------

// Minimal KV stub: registry tests never touch the cache, but buildContext wires it.
const fakeEnv = { CACHE: { get: async () => null, put: async () => {} } } as unknown as Env;

const app = createApp([
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
    const res = await app.request("/api/cached", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("CDN-Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400",
    );
    expect(res.headers.get("Vary")).toBe("Accept, Accept-Encoding");
  });

  it("marks live-state routes as no-store on both browser and CDN layers", async () => {
    const res = await app.request("/api/live", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("wraps handler payloads in the data envelope and applies query defaults", async () => {
    const res = await app.request("/api/params", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { n: 5 } });
  });

  it("rejects out-of-range numeric params with a 400 envelope", async () => {
    const res = await app.request("/api/params?n=99", {}, fakeEnv);
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
    const env = statefulEnv();
    const init = { headers: { "CF-Connecting-IP": "203.0.113.7" } };
    expect((await rateLimitedApp.request("/api/limited", init, env)).status).toBe(200);
    expect((await rateLimitedApp.request("/api/limited", init, env)).status).toBe(200);
    const blocked = await rateLimitedApp.request("/api/limited", init, env);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: { code: number } };
    expect(body.error.code).toBe(429);
  });

  it("keys the budget per client IP", async () => {
    const env = statefulEnv();
    const other = { headers: { "CF-Connecting-IP": "198.51.100.9" } };
    expect((await rateLimitedApp.request("/api/limited", other, env)).status).toBe(200);
  });

  it("skips limiting when no client IP header is present (local dev / tests)", async () => {
    const env = statefulEnv();
    for (let i = 0; i < 3; i++) {
      expect((await rateLimitedApp.request("/api/limited", {}, env)).status).toBe(200);
    }
  });
});

// -- warmup -------------------------------------------------------------------

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

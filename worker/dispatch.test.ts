import { describe, expect, it } from "vitest";
import { fetchHandler } from "./index";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import { apiPaths } from "@/shared/config";
import type { Env } from "@/server/context";

const ASSETS_BODY = "asset-body";
const env = {
  ASSETS: { fetch: async () => new Response(ASSETS_BODY, { status: 200 }) },
} as unknown as Env;

const UNKNOWN_API_PATH = "https://example.com/api/no-such-route";

describe("fetchHandler dispatch", () => {
  it("answers OPTIONS on an existing route with 204 and the API headers", async () => {
    const res = await fetchHandler(new Request(`https://example.com${apiPaths.news}`, { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("X-Contract-Version")).toBe(CACHE_VERSION);
  });

  it("rejects a non-GET method on an existing route with 405", async () => {
    const res = await fetchHandler(new Request(`https://example.com${apiPaths.news}`, { method: "POST" }), env);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("answers 404, not 405, for a non-GET method on a path with no route", async () => {
    const res = await fetchHandler(new Request(UNKNOWN_API_PATH, { method: "POST" }), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Allow")).toBeNull();
  });

  it("answers 404, not a fabricated preflight, for OPTIONS on a path with no route", async () => {
    const res = await fetchHandler(new Request(UNKNOWN_API_PATH, { method: "OPTIONS" }), env);
    expect(res.status).toBe(404);
  });

  it("answers 404 for the bare API prefix, which is not a route", async () => {
    const res = await fetchHandler(new Request("https://example.com/api"), env);
    expect(res.status).toBe(404);
  });

  it("strips the body of a HEAD response", async () => {
    const res = await fetchHandler(new Request(UNKNOWN_API_PATH, { method: "HEAD" }), env);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("delegates a non-API request to the static assets binding", async () => {
    const res = await fetchHandler(new Request("https://example.com/models"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ASSETS_BODY);
  });

  it("does not turn an HTML SPA fallback into a cached asset", async () => {
    const htmlEnv = {
      ASSETS: {
        fetch: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      },
    } as unknown as Env;
    const res = await fetchHandler(new Request("https://example.com/assets/missing.js"), htmlEnv);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });
  it("404s a missing static file by extension, and never a dotted SPA route", async () => {
    const htmlEnv = {
      ASSETS: {
        fetch: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      },
    } as unknown as Env;
    for (const path of ["/icons/icon-192.png", "/manifest.webmanifest", "/sw.js"]) {
      const res = await fetchHandler(new Request(`https://example.com${path}`), htmlEnv);
      expect(res.status, path).toBe(404);
    }
    const spa = await fetchHandler(new Request("https://example.com/model/gpt-4.1"), htmlEnv);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toBe("<html></html>");
  });
});

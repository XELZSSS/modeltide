import { describe, expect, it } from "vitest";
import { fetchHandler } from "./index";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import type { Env } from "@/server/context";

const ASSETS_BODY = "asset-body";
const env = {
  ASSETS: { fetch: async () => new Response(ASSETS_BODY, { status: 200 }) },
} as unknown as Env;

describe("fetchHandler dispatch", () => {
  it("answers OPTIONS on an API path with 204 and the API headers", async () => {
    const res = await fetchHandler(new Request("https://example.com/api/anything", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("X-Contract-Version")).toBe(CACHE_VERSION);
  });

  it("rejects a non-GET method on an API path with 405", async () => {
    const res = await fetchHandler(new Request("https://example.com/api/anything", { method: "POST" }), env);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("strips the body of a HEAD response", async () => {
    const res = await fetchHandler(new Request("https://example.com/api/no-such-route", { method: "HEAD" }), env);
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
});

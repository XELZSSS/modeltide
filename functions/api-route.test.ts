import { describe, expect, it } from "vitest";
import { onRequest, resolveRoute } from "./api/[[route]]";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import { apiPaths } from "@/shared/config";

const UNKNOWN_API_PATH = "https://example.com/api/no-such-route";

describe("pages functions dispatch", () => {
  it("resolves a registered pathname to its route entry", () => {
    expect(resolveRoute(apiPaths.news)?.path).toBe(apiPaths.news);
    expect(resolveRoute("/api/does-not-exist")).toBeUndefined();
  });

  it("answers OPTIONS on an existing route with 204 and the API headers", async () => {
    const res = await onRequest({
      request: new Request(`https://example.com${apiPaths.news}`, { method: "OPTIONS" }),
      env: {},
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("X-Contract-Version")).toBe(CACHE_VERSION);
  });

  it("rejects a non-GET method on an existing route with 405", async () => {
    const res = await onRequest({
      request: new Request(`https://example.com${apiPaths.news}`, { method: "POST" }),
      env: {},
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("answers 404, not 405, for a non-GET method on a path with no route", async () => {
    const res = await onRequest({ request: new Request(UNKNOWN_API_PATH, { method: "POST" }), env: {} });
    expect(res.status).toBe(404);
    expect(res.headers.get("Allow")).toBeNull();
  });

  it("answers 404, not a fabricated preflight, for OPTIONS on a path with no route", async () => {
    const res = await onRequest({ request: new Request(UNKNOWN_API_PATH, { method: "OPTIONS" }), env: {} });
    expect(res.status).toBe(404);
  });

  it("answers 404 for the bare API prefix, which is not a route", async () => {
    const res = await onRequest({ request: new Request("https://example.com/api", { method: "GET" }), env: {} });
    expect(res.status).toBe(404);
  });

  it("strips the body of a HEAD response", async () => {
    const res = await onRequest({ request: new Request(UNKNOWN_API_PATH, { method: "HEAD" }), env: {} });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

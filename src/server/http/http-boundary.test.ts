import { describe, expect, it } from "vitest";
import {
  handleApiRoute,
  methodNotAllowedResponse,
  notFoundResponse,
  stripBodyForHead,
} from "@/server/routes/define-route";
import { applyApiHeaders } from "@/server/http/headers";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { qEnum } from "@/server/infra/query-validation";
import { BROWSER_CACHE_HEADER, BROWSER_NO_STORE_HEADER, CDN_CACHE_HEADER, CDN_NO_STORE_HEADER } from "@/server/config";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";

const PAYLOAD = { data: [], fetchedAt: "2026-01-01T00:00:00.000Z" };
const URL = "https://example.com/api/probe";
const PATH = "/api/probe";

function call(url: string, def: Parameters<typeof handleApiRoute>[3]): Promise<Response> {
  return handleApiRoute(new Request(url), {}, PATH, def);
}

describe("http boundary", () => {
  it("answers an unknown route with the shared error envelope", async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 404, message: "Not found" } });
  });

  it("answers a non-GET method with 405 and an Allow header", async () => {
    const res = methodNotAllowedResponse();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect(await res.json()).toEqual({ error: { code: 405, message: "Method not allowed" } });
  });

  it("applies CORS, security and contract-version headers to every API response", () => {
    const headers = new Headers();
    applyApiHeaders(headers);
    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Access-Control-Expose-Headers")).toBe("X-Contract-Version");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Contract-Version")).toBe(CACHE_VERSION);
  });

  it("strips the body and its length headers for HEAD", async () => {
    const full = new Response(JSON.stringify(PAYLOAD), {
      status: 200,
      headers: { "content-type": "application/json", "content-length": "999", "content-encoding": "gzip" },
    });
    const res = stripBodyForHead(full);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(res.headers.get("content-length")).toBeNull();
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("rejects an out-of-range query value with the envelope and a 400", async () => {
    const res = await call(`${URL}?kind=zzz`, {
      query: { kind: qEnum(["a", "b"], "a") },
      handler: async () => PAYLOAD,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(400);
    expect(body.error.message).toContain("kind");
  });

  it("ignores unknown query params instead of failing the request", async () => {
    const res = await call(`${URL}?kind=a&junk=1`, {
      query: { kind: qEnum(["a", "b"], "a") },
      handler: async () => PAYLOAD,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAYLOAD);
  });

  it("maps a client abort to 499 with no body", async () => {
    const res = await call(URL, {
      handler: async () => {
        throw new ClientAbortError("client went away");
      },
    });
    expect(res.status).toBe(499);
    expect(await res.text()).toBe("");
  });

  it("maps a timed-out upstream to 504", async () => {
    const res = await call(URL, {
      handler: async () => {
        throw new UpstreamError("slow", { timeout: true });
      },
    });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 504, message: "Upstream request timed out" } });
  });

  it("reports an upstream failure as a generic 502 without leaking the upstream detail", async () => {
    const res = await call(URL, {
      handler: async () => {
        throw new UpstreamError("openrouter said 503 Service Unavailable", { status: 503 });
      },
    });
    expect(res.status).toBe(502);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({
      error: { code: 502, message: "Upstream data source temporarily unavailable" },
    });
    expect(raw).not.toContain("503");
    expect(raw).not.toContain("openrouter");
  });

  it("reports an unclassified failure as 500", async () => {
    const res = await call(URL, {
      handler: async () => {
        throw new TypeError("kaboom");
      },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: "Internal server error" } });
  });

  it("sets the default browser and CDN cache policy plus Vary", async () => {
    const res = await call(URL, { handler: async () => PAYLOAD });
    expect(res.headers.get("Cache-Control")).toBe(BROWSER_CACHE_HEADER);
    expect(res.headers.get("CDN-Cache-Control")).toBe(CDN_CACHE_HEADER);
    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
  });

  it("honours a per-route cache override and sends no-store on failures", async () => {
    const override = { browser: "public, max-age=15", cdn: "public, max-age=30, stale-while-revalidate=30" };
    const ok = await call(URL, { cache: override, handler: async () => PAYLOAD });
    expect(ok.headers.get("Cache-Control")).toBe(override.browser);
    expect(ok.headers.get("CDN-Cache-Control")).toBe(override.cdn);

    const bad = await call(`${URL}?kind=zzz`, {
      query: { kind: qEnum(["a"], "a") },
      handler: async () => PAYLOAD,
    });
    expect(bad.status).toBe(400);
    expect(bad.headers.get("Cache-Control")).toBe(BROWSER_NO_STORE_HEADER);
    expect(bad.headers.get("CDN-Cache-Control")).toBe(CDN_NO_STORE_HEADER);
  });
});

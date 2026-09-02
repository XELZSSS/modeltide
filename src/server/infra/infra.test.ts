import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { CacheService } from "@/server/infra/cache";
import { HttpClient } from "@/server/infra/http";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { validateQuery } from "@/server/infra/validate";

// Consolidated tests for the server core layer: KV cache, HTTP client and query validation.

// -- CacheService -------------------------------------------------------------

describe("CacheService (KV backend in workerd)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("persists values through the real KV binding", async () => {
    const cache = new CacheService(env.CACHE, "v1");
    const fn = vi.fn(async () => ({ data: { a: 1 } }));

    expect(await cache.withTtl("kv-int", 60_000, fn)).toEqual({ a: 1 });
    expect(await cache.withTtl("kv-int", 60_000, fn)).toEqual({ a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stores values under versioned keys in KV", async () => {
    const v1 = new CacheService(env.CACHE, "v1");
    const v2 = new CacheService(env.CACHE, "v2");
    const fn = vi.fn(async () => ({ data: "x" }));

    await v1.withTtl("shared", 60_000, fn);
    await v2.withTtl("shared", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);

    await v1.withTtl("shared", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent fetches for the same key", async () => {
    const cache = new CacheService(env.CACHE, "v1");
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
});

// -- HttpClient ---------------------------------------------------------------

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

// -- validateQuery ------------------------------------------------------------

describe("validateQuery", () => {
  it("applies defaults when the param is missing", () => {
    const out = validateQuery({}, { sort: { type: "enum", values: ["a", "b"], default: "a" } });
    expect(out.sort).toBe("a");
  });

  it("treats empty-string params as absent and applies the default", () => {
    const out = validateQuery(
      { limit: "", sort: "" },
      { limit: { type: "number", default: "25", min: 1 }, sort: { type: "enum", values: ["a", "b"], default: "a" } },
    );
    expect(out.limit).toBe(25);
    expect(out.sort).toBe("a");
  });

  it("treats whitespace-only params as absent and applies the default", () => {
    const out = validateQuery({ limit: "   " }, { limit: { type: "number", default: "25", min: 1 } });
    expect(out.limit).toBe(25);
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
});

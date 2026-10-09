import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "./http-client";
import { createSlotPools } from "./connection-pool";

const TEST_URL = "https://example.com/probe-target";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpClient global fetch binding", () => {
  it("does not detach the global fetch (the runtime throws Illegal invocation otherwise)", async () => {
    const stub = vi.fn(function (this: unknown, _input: unknown, _init?: unknown) {
      // Mimics the Pages Functions runtime: fetch called with the wrong receiver throws.
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("hello"));
    });
    vi.stubGlobal("fetch", stub);
    const client = new HttpClient();
    await expect(client.text(TEST_URL, { timeoutMs: 5_000, retries: 0 })).resolves.toBe("hello");
    expect(stub).toHaveBeenCalled();
  });

  it("probe works with the default fetch implementation", async () => {
    const stub = vi.fn(function (this: unknown, _input: unknown, _init?: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", stub);
    const client = new HttpClient();
    const result = await client.probe(TEST_URL);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it("preserves the underlying fetch failure reason in the error message", async () => {
    const failure = new TypeError("fetch failed");
    const client = new HttpClient({
      fetchImpl: () => Promise.reject(failure),
    });
    await expect(client.text(TEST_URL, { timeoutMs: 5_000, retries: 0 })).rejects.toThrow(
      /Upstream network error.*fetch failed/,
    );
  });

  it("gives each client its own connection pools", () => {
    const a = new HttpClient();
    const b = new HttpClient();
    expect(a.pools).not.toBe(b.pools);
  });

  it("uses explicitly provided pools", () => {
    const pools = createSlotPools();
    const client = new HttpClient({ pools });
    expect(client.pools).toBe(pools);
  });
});

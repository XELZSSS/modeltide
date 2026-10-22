import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONE_MINUTE } from "@/shared/config/time";
import { UpstreamError } from "@/server/api/errors";
import { KvStore } from "./kv";
import { CacheService, resetModuleCachesForTests } from "./service";
import { maxStaleMs, sharedL1 } from "./store";

const VERSION = "svc-test";
const silentLog = (): void => {};

function fakeKv(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  const stats = { gets: 0, puts: 0, deletes: 0 };
  const kv = new KvStore({
    async get(key: string): Promise<string | null> {
      stats.gets += 1;
      return data.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      stats.puts += 1;
      data.set(key, value);
    },
    async delete(key: string): Promise<void> {
      stats.deletes += 1;
      data.delete(key);
    },
  });
  return { kv, data, stats };
}

function envelope(value: unknown, expiresAt: number, ttl: number = ONE_MINUTE): string {
  return JSON.stringify({ d: value, e: expiresAt, t: ttl });
}

function service(kv?: KvStore, opts?: { callerSignal?: AbortSignal; onDetach?: (work: Promise<unknown>) => void }) {
  return new CacheService(kv, VERSION, { ...opts, log: silentLog });
}

function gatedLoader(value: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fn = vi.fn(async () => {
    await gate;
    return { data: value, ttl: ONE_MINUTE };
  });
  return { fn, release };
}

beforeEach(() => {
  resetModuleCachesForTests();
});

describe("CacheService.withTtlResult", () => {
  it("runs the loader once and serves the second call from L1", async () => {
    const { kv, stats } = fakeKv();
    const cache = service(kv);
    const fn = vi.fn(async () => ({ data: { n: 1 }, ttl: ONE_MINUTE }));

    await expect(cache.withTtlResult("warm", ONE_MINUTE, fn)).resolves.toEqual({ value: { n: 1 }, degraded: false });
    await expect(cache.withTtlResult("warm", ONE_MINUTE, fn)).resolves.toEqual({ value: { n: 1 }, degraded: false });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(stats.gets).toBe(1);
    expect(stats.puts).toBe(1);
  });

  it("serves an unexpired KV envelope without calling the loader and backfills L1", async () => {
    const { kv } = fakeKv({ [`${VERSION}:kv-hit`]: envelope({ n: 2 }, Date.now() + ONE_MINUTE) });
    const cache = service(kv);
    const fn = vi.fn(async () => ({ data: { n: 99 } }));

    await expect(cache.withTtlResult("kv-hit", ONE_MINUTE, fn)).resolves.toEqual({ value: { n: 2 }, degraded: false });
    expect(fn).not.toHaveBeenCalled();
    expect(sharedL1.get<{ n: number }>(`${VERSION}:kv-hit`)?.d).toEqual({ n: 2 });
  });

  it("returns a stale KV value with degraded=true when the refresh fails", async () => {
    const { kv } = fakeKv({ [`${VERSION}:stale`]: envelope({ n: 3 }, Date.now() - 1_000) });
    const cache = service(kv);
    const fn = vi.fn(async () => {
      throw new Error("upstream down");
    });

    await expect(cache.withTtlResult("stale", ONE_MINUTE, fn)).resolves.toEqual({ value: { n: 3 }, degraded: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the original refresh error when no usable stale copy exists", async () => {
    const { kv } = fakeKv();
    const cache = service(kv);
    const boom = new Error("upstream down");
    const fn = vi.fn(async () => {
      throw boom;
    });

    await expect(cache.withTtlResult("cold", ONE_MINUTE, fn)).rejects.toBe(boom);
  });

  it("treats a copy older than maxStaleMs as unusable and surfaces the error instead", async () => {
    const ttl = ONE_MINUTE;
    const expiredAt = Date.now() - maxStaleMs(ttl) - 5_000;
    const { kv } = fakeKv({ [`${VERSION}:too-stale`]: envelope({ n: 4 }, expiredAt, ttl) });
    const cache = service(kv);
    const boom = new UpstreamError("refresh failed", { status: 503 });
    const fn = vi.fn(async () => {
      throw boom;
    });

    await expect(cache.withTtlResult("too-stale", ttl, fn)).rejects.toBe(boom);
  });

  it("coalesces two concurrent refreshes of the same key into a single loader call", async () => {
    const { kv } = fakeKv();
    const cache = service(kv);
    const { fn, release } = gatedLoader({ n: 5 });

    const first = cache.withTtlResult("shared", ONE_MINUTE, fn);
    const second = cache.withTtlResult("shared", ONE_MINUTE, fn);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ value: { n: 5 }, degraded: false });
    expect(b).toEqual({ value: { n: 5 }, degraded: false });
  });

  it("skips KV reads and writes entirely in memoryOnly mode", async () => {
    const { kv, stats } = fakeKv();
    const cache = service(kv);
    const fn = vi.fn(async () => ({ data: { n: 6 }, ttl: ONE_MINUTE }));

    await expect(cache.withTtlResult("mem", ONE_MINUTE, fn, { memoryOnly: true })).resolves.toEqual({
      value: { n: 6 },
      degraded: false,
    });
    await expect(cache.withTtlResult("mem", ONE_MINUTE, fn, { memoryOnly: true })).resolves.toEqual({
      value: { n: 6 },
      degraded: false,
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(stats.gets).toBe(0);
    expect(stats.puts).toBe(0);
  });

  it("rejects with a 499 ClientAbortError when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("gone", "AbortError"));
    const { kv } = fakeKv();
    const cache = service(kv, { callerSignal: controller.signal });
    const fn = vi.fn(async () => ({ data: { n: 7 } }));

    await expect(cache.withTtlResult("aborted", ONE_MINUTE, fn)).rejects.toMatchObject({
      name: "ClientAbortError",
      status: 499,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not call the loader again inside the failure-cooldown window", async () => {
    const { kv } = fakeKv();
    const cache = service(kv);
    const boom = new UpstreamError("upstream exploded", { retryable: true });
    const fn = vi.fn(async () => {
      throw boom;
    });

    await expect(cache.withTtlResult("cool", ONE_MINUTE, fn)).rejects.toBe(boom);
    await expect(cache.withTtlResult("cool", ONE_MINUTE, fn)).rejects.toMatchObject({
      name: "UpstreamError",
      message: expect.stringContaining("failure cooldown"),
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves stale immediately and refreshes in the background when onDetach is provided", async () => {
    const key = `${VERSION}:bg`;
    const { kv, data } = fakeKv({ [key]: envelope({ n: 8 }, Date.now() - 1_000) });
    const detached: Promise<unknown>[] = [];
    const cache = service(kv, { onDetach: (work) => detached.push(work) });
    const fn = vi.fn(async () => ({ data: { n: 9 }, ttl: ONE_MINUTE }));

    await expect(cache.withTtlResult("bg", ONE_MINUTE, fn)).resolves.toEqual({ value: { n: 8 }, degraded: false });
    expect(detached.length).toBeGreaterThanOrEqual(1);

    await vi.waitFor(() => {
      expect(JSON.parse(data.get(key) ?? "null")).toMatchObject({ d: { n: 9 } });
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

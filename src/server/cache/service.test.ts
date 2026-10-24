import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONE_MINUTE } from "@/shared/config/time";
import { ClientAbortError, UpstreamError } from "@/server/api/errors";
import { KvStore } from "./kv";
import { CacheService, resetModuleCachesForTests } from "./service";
import { sharedL1 } from "./l1";
import { maxStaleMs } from "./stale";

const VERSION = "svc-test";
const silentLog = (): void => {};

interface SeedEntry {
  value: string;
  metadata: unknown;
}

function fakeKv(seed: Record<string, SeedEntry> = {}) {
  const data = new Map<string, SeedEntry>(Object.entries(seed));
  const stats = { gets: 0, puts: 0, deletes: 0 };
  const kv = new KvStore({
    async getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }> {
      stats.gets += 1;
      const entry = data.get(key);
      return entry ? { value: entry.value, metadata: entry.metadata } : { value: null, metadata: null };
    },
    async put(key: string, value: string, options?: { metadata?: unknown }): Promise<void> {
      stats.puts += 1;
      data.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string): Promise<void> {
      stats.deletes += 1;
      data.delete(key);
    },
  });
  return { kv, data, stats };
}

function entryOf(value: unknown, expiresAt: number, ttl: number = ONE_MINUTE): SeedEntry {
  return { value: JSON.stringify(value), metadata: { e: expiresAt, t: ttl } };
}

/** Every path below delivers the payload together with its exact encoded body. */
function delivered(value: unknown, degraded = false) {
  return { value, degraded, body: JSON.stringify(value) };
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

    await expect(cache.withTtlResult("warm", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 1 }));
    await expect(cache.withTtlResult("warm", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 1 }));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(stats.gets).toBe(1);
    expect(stats.puts).toBe(1);
  });

  it("serves an unexpired KV entry without calling the loader and backfills L1 with the same body", async () => {
    const { kv } = fakeKv({ [`${VERSION}:kv-hit`]: entryOf({ n: 2 }, Date.now() + ONE_MINUTE) });
    const cache = service(kv);
    const fn = vi.fn(async () => ({ data: { n: 99 } }));

    await expect(cache.withTtlResult("kv-hit", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 2 }));
    expect(fn).not.toHaveBeenCalled();
    const l1 = sharedL1.get<{ n: number }>(`${VERSION}:kv-hit`);
    expect(l1?.d).toEqual({ n: 2 });
    expect(l1?.s).toBe(JSON.stringify({ n: 2 }));
  });

  it("returns a stale KV value with degraded=true when the refresh fails", async () => {
    const { kv } = fakeKv({ [`${VERSION}:stale`]: entryOf({ n: 3 }, Date.now() - 1_000) });
    const cache = service(kv);
    const fn = vi.fn(async () => {
      throw new Error("upstream down");
    });

    await expect(cache.withTtlResult("stale", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 3 }, true));
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
    const { kv } = fakeKv({ [`${VERSION}:too-stale`]: entryOf({ n: 4 }, expiredAt, ttl) });
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
    expect(a).toEqual(delivered({ n: 5 }));
    expect(b).toEqual(delivered({ n: 5 }));
  });

  it("serves the second call from L1 when no CACHE KV binding is configured", async () => {
    const cache = service(undefined);
    const fn = vi.fn(async () => ({ data: { n: 6 }, ttl: ONE_MINUTE }));

    await expect(cache.withTtlResult("mem", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 6 }));
    await expect(cache.withTtlResult("mem", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 6 }));

    expect(fn).toHaveBeenCalledTimes(1);
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
    const { kv, data } = fakeKv({ [key]: entryOf({ n: 8 }, Date.now() - 1_000) });
    const detached: Promise<unknown>[] = [];
    const cache = service(kv, { onDetach: (work) => detached.push(work) });
    const fn = vi.fn(async () => ({ data: { n: 9 }, ttl: ONE_MINUTE }));

    await expect(cache.withTtlResult("bg", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 8 }));
    expect(detached.length).toBeGreaterThanOrEqual(1);

    await vi.waitFor(() => {
      expect(JSON.parse(data.get(key)!.value)).toEqual({ n: 9 });
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports the stale copy as degraded once its detached refresh is known to have failed", async () => {
    const { kv } = fakeKv({ [`${VERSION}:bg-fail`]: entryOf({ n: 10 }, Date.now() - 1_000) });
    const detached: Promise<unknown>[] = [];
    const cache = service(kv, { onDetach: (work) => detached.push(work) });
    const fn = vi.fn(async () => {
      throw new UpstreamError("upstream exploded", { status: 503 });
    });

    // The request that starts the refresh still answers from the stale copy as complete: the refresh had not failed yet.
    await expect(cache.withTtlResult("bg-fail", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 10 }));
    await Promise.allSettled(detached);

    // Once that refresh has failed, the same stale bytes are a data gap and have to say so, or the client keeps
    // `partial: false` on a copy that can no longer be refreshed and never starts its partial-poll.
    await expect(cache.withTtlResult("bg-fail", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 10 }, true));
  });

  it("keeps a stale copy complete when the detached refresh was cancelled by the reader", async () => {
    const { kv } = fakeKv({ [`${VERSION}:bg-abort`]: entryOf({ n: 11 }, Date.now() - 1_000) });
    const detached: Promise<unknown>[] = [];
    const cache = service(kv, { onDetach: (work) => detached.push(work) });
    const fn = vi.fn(async () => {
      throw new ClientAbortError("reader left");
    });

    await expect(cache.withTtlResult("bg-abort", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 11 }));
    await Promise.allSettled(detached);

    // A reader that went away says nothing about the source, so the next reader must not see a degraded answer.
    await expect(cache.withTtlResult("bg-abort", ONE_MINUTE, fn)).resolves.toEqual(delivered({ n: 11 }));
  });
});

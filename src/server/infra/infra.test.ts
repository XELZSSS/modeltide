import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { CacheService, resetModuleCachesForTests } from "@/server/infra/cache/service";
import { HttpClient } from "@/server/infra/http-client";
import { ClientAbortError, UpstreamError, wrapUpstream } from "@/server/infra/errors";
import { mapKV } from "@/server/test-helpers";
import { MEMORY_CACHE_MAX_BYTES } from "@/server/config";
import { validateQuery, qEnum, qNum, qStr } from "@/server/infra/query-validation";
import { runCapped } from "@/server/infra/task-pool";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const makeCache = (version = "v-test", opts?: { failureCooldownMs?: number }) =>
  new CacheService(undefined, version, opts);
const countingFn =
  <T>(value: T, calls: { n: number }) =>
  async () => {
    calls.n += 1;
    return { data: value };
  };

describe("cache-service", () => {
  beforeEach(() => resetModuleCachesForTests());
  afterEach(() => vi.useRealTimers());

  it("serves fresh L1 without refetch", async () => {
    const cache = makeCache();
    const calls = { n: 0 };
    expect(await cache.withTtl("k", 60_000, countingFn("1", calls))).toBe("1");
    expect(await cache.withTtl("k", 60_000, countingFn("2", calls))).toBe("1");
    expect(calls.n).toBe(1);
  });

  it("evicts the oldest L1 entry beyond the entry cap and keeps serving hits", async () => {
    const cache = makeCache("v-lru");
    for (let i = 0; i < 201; i++) {
      await cache.withTtl(`k${i}`, 60_000, async () => ({ data: `v${i}` }));
    }
    const calls = { n: 0 };
    expect(await cache.withTtl("k0", 60_000, countingFn("fresh", calls))).toBe("fresh");
    expect(calls.n).toBe(1);
    expect(await cache.withTtl("k200", 60_000, countingFn("should-not-run", calls))).toBe("v200");
  });

  it("keeps oversized payloads out of the L1 (serialized-bytes budget)", async () => {
    const cache = makeCache("v-big");
    const huge = "字".repeat(Math.ceil((MEMORY_CACHE_MAX_BYTES + 1024) / 3));
    const calls = { n: 0 };
    const fn = countingFn(huge, calls);
    await cache.withTtl("big", 60_000, fn);
    await cache.withTtl("big", 60_000, fn);
    expect(calls.n).toBe(2);
  });

  it("hard-cuts on version bumps: previous-generation keys are ignored, not adopted", async () => {
    const kv = mapKV(
      new Map([["v1:adopt-me", JSON.stringify({ d: "legacy-data", e: Date.now() + 60_000, t: 60_000 })]]),
    );
    const cache = new CacheService(kv, "v3");
    const calls = { n: 0 };
    expect(await cache.withTtl("adopt-me", 60_000, countingFn("1", calls))).toBe("1");
    expect(calls.n).toBe(1);
    expect(kv.store.has("v3:adopt-me")).toBe(true);
    expect(kv.store.has("v1:adopt-me")).toBe(true);
  });

  describe("failure cooldown", () => {
    it("arms after a failed refresh and fast-fails subsequent calls", async () => {
      const cache = makeCache("v-cool", { failureCooldownMs: 30 });
      const calls = { n: 0 };
      await expect(
        cache.withTtl("ck", 60_000, async () => {
          calls.n += 1;
          throw new Error("upstream down");
        }),
      ).rejects.toThrow("upstream down");
      await expect(cache.withTtl("ck", 60_000, async () => ({ data: "x" }))).rejects.toThrow(/cooldown/);
      expect(calls.n).toBe(1);
    });

    it("joins an in-flight refresh instead of fast-failing behind it", async () => {
      const cache = makeCache("v-cool3", { failureCooldownMs: 30 });
      const calls = { n: 0 };
      const first = cache.withTtl("ck3", 60_000, async () => {
        calls.n += 1;
        await sleep(20);
        return { data: "slow" };
      });
      const second = cache.withTtl("ck3", 60_000, async () => {
        calls.n += 1;
        return { data: "never" };
      });
      await expect(Promise.all([first, second])).resolves.toEqual(["slow", "slow"]);
      expect(calls.n).toBe(1);
    });
  });

  describe("caller isolation", () => {
    it("a leader abort rejects only that caller while the joiner still succeeds", async () => {
      const leaderAbort = new AbortController();
      const leader = new CacheService(undefined, "v-iso", { callerSignal: leaderAbort.signal });
      const joiner = new CacheService(undefined, "v-iso", { callerSignal: new AbortController().signal });
      const calls = { n: 0 };
      const slow = async () => {
        calls.n += 1;
        await sleep(20);
        return { data: "shared" };
      };
      // The leader claims the inflight slot synchronously, so the joiner joins.
      const leaderP = leader.withTtl("ik", 60_000, slow);
      const joinerP = joiner.withTtl("ik", 60_000, async () => ({ data: "never" }));
      leaderAbort.abort();
      await expect(leaderP).rejects.toThrow(/aborted/);
      await expect(leaderP).rejects.toHaveProperty("name", "ClientAbortError");
      await expect(joinerP).resolves.toBe("shared");
      expect(calls.n).toBe(1);
    });

    it("never arms the cooldown from a ClientAbortError", async () => {
      const cache = new CacheService(undefined, "v-iso2");
      await expect(
        cache.withTtl("cab", 60_000, async () => {
          throw new ClientAbortError("caller gone");
        }),
      ).rejects.toThrow(/caller gone/);
      const calls = { n: 0 };
      await expect(cache.withTtl("cab", 60_000, countingFn("ok", calls))).resolves.toBe("ok");
      expect(calls.n).toBe(1);
    });

    it("still arms the cooldown for a genuine failure", async () => {
      const cache = new CacheService(undefined, "v-iso2b", { failureCooldownMs: 30 });
      await expect(
        cache.withTtl("gb", 60_000, async () => {
          throw new UpstreamError("upstream down", { timeout: true });
        }),
      ).rejects.toThrow(/upstream down/);
      await expect(cache.withTtl("gb", 60_000, async () => ({ data: "x" }))).rejects.toThrow(/cooldown/);
    });
  });

  describe("memoryOnly scope", () => {
    it("writes nothing to KV but still serves L1 hits", async () => {
      const kv = mapKV();
      const cache = new CacheService(kv, "v-mem");
      const calls = { n: 0 };
      const fn = async () => ({ data: `v${(calls.n += 1)}` });
      expect(await cache.withTtl("mk", 60_000, fn, { memoryOnly: true })).toBe("v1");
      expect(await cache.withTtl("mk", 60_000, fn, { memoryOnly: true })).toBe("v1");
      expect(calls.n).toBe(1);
      expect(kv.store.size).toBe(0);
    });

    it("serves bounded stale from memory when refresh fails", async () => {
      vi.useFakeTimers();
      try {
        const cache = makeCache("v-mem2");
        let fail = false;
        const fn = async () => {
          if (fail) throw new Error("down");
          return { data: "v1" };
        };
        await cache.withTtl("ms", 50, fn, { memoryOnly: true });
        await vi.advanceTimersByTimeAsync(80);
        fail = true;
        await expect(cache.withTtl("ms", 50, fn, { memoryOnly: true })).resolves.toBe("v1");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("validation", () => {
  it("accepts allowlisted enums and clamps numbers", () => {
    expect(
      validateQuery(
        { category: "hardware", limit: "10" },
        {
          category: qEnum(["industry", "hardware"] as const, "industry"),
          limit: qNum({ default: "5", min: 1, max: 100, integer: true }),
        },
      ),
    ).toMatchObject({ category: "hardware", limit: 10 });
  });

  it.each([
    [{ category: "evil" }, { category: qEnum(["a"] as const, "a") }],
    [{ n: "x".repeat(501) }, { n: qEnum(["x"] as const) }],
  ])("rejects bad input %j", (input, schema) => {
    expect(() => validateQuery(input, schema)).toThrow();
  });

  it("rejects repeated params", () => {
    expect(() =>
      validateQuery(
        { category: ["hardware", "evil"] },
        { category: qEnum(["industry", "hardware"] as const, "industry") },
      ),
    ).toThrow();
  });

  it("rejects empty values instead of falling back to defaults", () => {
    expect(() =>
      validateQuery({ category: "" }, { category: qEnum(["industry", "hardware"] as const, "industry") }),
    ).toThrow();
    expect(() => validateQuery({ limit: "" }, { limit: qNum({ default: "5", min: 1, max: 100 }) })).toThrow();
  });

  it("rejects missing required params without defaults", () => {
    expect(() => validateQuery({}, { id: qStr({ maxLength: 200 }) })).toThrow();
  });

  it.each([[{ id: "org/model" }, undefined, "org/model"]])(
    "accepts strings within maxLength and applies defaults",
    (input, def, expected) => {
      expect(validateQuery(input, { id: qStr(def ? { default: def } : { maxLength: 200 }) }).id).toBe(expected);
    },
  );
});

describe("runCapped pool", () => {
  it("keeps results in caller order and preserves rejection reasons", async () => {
    const boom = new Error("third");
    await expect(
      runCapped([async () => "a", async () => "b", async () => Promise.reject(boom), async () => "d"], 2),
    ).resolves.toEqual([
      { status: "fulfilled", value: "a" },
      { status: "fulfilled", value: "b" },
      { status: "rejected", reason: boom },
      { status: "fulfilled", value: "d" },
    ]);
  });

  it("never runs more tasks concurrently than the cap", async () => {
    let active = 0;
    let peak = 0;
    await runCapped(
      Array.from({ length: 12 }, () => async () => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(5);
        active -= 1;
      }),
      3,
    );
    expect(peak).toBe(3);
  });
});

describe("wrapUpstream", () => {
  it.each([
    ["timeout flag", new UpstreamError("Upstream timeout", { timeout: true }), 504, true],
    ["origin 404", new UpstreamError("HTTP 404", { status: 404 }), 502, false],
    ["plain error", new Error("boom"), 502, false],
  ])("maps %s to status %s", (_label, cause, status, causedByTimeout) => {
    const err = wrapUpstream("X failed", cause);
    expect(err.status).toBe(status);
    expect(err.causedByTimeout).toBe(causedByTimeout);
    expect(err.message).toContain("X failed");
  });

  it("detects TimeoutError by name", () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    expect(wrapUpstream("X", timeout).causedByTimeout).toBe(true);
  });
});

describe("http-client retry policy", () => {
  it("retries 408 Request Timeout like a 5xx", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        calls.push(String(url));
        if (calls.length === 1) return new Response("timeout", { status: 408 });
        return Response.json({ ok: 1 });
      }),
    );
    try {
      await expect(new HttpClient().json("https://x.example/a", { retries: 1 })).resolves.toEqual({ ok: 1 });
      expect(calls).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("http-client deadline semantics", () => {
  it("classifies a work-deadline abort as a timeout, not a client abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      ),
    );
    try {
      const abort = new AbortController();
      const http = new HttpClient({ signal: abort.signal });
      const pending = http.text("https://x.example/slow");
      abort.abort();
      const err = await pending.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(UpstreamError);
      expect((err as UpstreamError).causedByTimeout).toBe(true);
      expect((err as UpstreamError).status).toBe(504);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { CacheService, resetModuleCachesForTests } from "@/server/infra/cache-service";
import { MEMORY_CACHE_MAX_BYTES } from "@/server/config";
import { validateQuery, qEnum, qNum, qStr } from "@/server/infra/validation";
import { runCapped } from "@/server/infra/pool";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("cache-service", () => {
  beforeEach(() => resetModuleCachesForTests());
  it("serves fresh L1 without refetch", async () => {
    const cache = new CacheService(undefined, "v-test");
    let calls = 0;
    const first = await cache.withTtl("k", 60_000, async () => ({ data: (++calls).toString() }));
    const second = await cache.withTtl("k", 60_000, async () => ({ data: (++calls).toString() }));
    expect(first).toBe("1");
    expect(second).toBe("1");
    expect(calls).toBe(1);
  });
  it("evicts the oldest L1 entry beyond the entry cap and keeps serving hits", async () => {
    const cache = new CacheService(undefined, "v-lru");
    for (let i = 0; i < 201; i++) {
      await cache.withTtl(`k${i}`, 60_000, async () => ({ data: `v${i}` }));
    }
    let k0calls = 0;
    const again = await cache.withTtl("k0", 60_000, async () => {
      k0calls += 1;
      return { data: "fresh" };
    });
    expect(k0calls).toBe(1);
    expect(again).toBe("fresh");
    const still = await cache.withTtl("k200", 60_000, async () => ({ data: "should-not-run" }));
    expect(still).toBe("v200");
  });

  it("keeps oversized payloads out of the L1 (serialized-bytes budget)", async () => {
    const cache = new CacheService(undefined, "v-big");
    const huge = "字".repeat(Math.ceil((MEMORY_CACHE_MAX_BYTES + 1024) / 3));
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return { data: huge };
    };
    await cache.withTtl("big", 60_000, fn);
    await cache.withTtl("big", 60_000, fn);
    expect(calls).toBe(2);
  });

  it("hard-cuts on version bumps: previous-generation keys are ignored, not adopted", async () => {
    const kvStore = new Map<string, string>([
      ["v1:adopt-me", JSON.stringify({ d: "legacy-data", e: Date.now() + 60_000, t: 60_000 })],
    ]);
    const kv = {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    } as unknown as KVNamespace;
    const cache = new CacheService(kv, "v3");
    let calls = 0;
    const data = await cache.withTtl("adopt-me", 60_000, async () => ({ data: (++calls).toString() }));
    expect(data).toBe("1");
    expect(calls).toBe(1);
    expect(kvStore.has("v3:adopt-me")).toBe(true);
    expect(kvStore.has("v1:adopt-me")).toBe(true);
  });

  describe("failure cooldown", () => {
    it("arms after a failed refresh and fast-fails subsequent calls", async () => {
      const cache = new CacheService(undefined, "v-cool", { failureCooldownMs: 30 });
      let calls = 0;
      await expect(
        cache.withTtl("ck", 60_000, async () => {
          calls += 1;
          throw new Error("upstream down");
        }),
      ).rejects.toThrow("upstream down");
      await expect(cache.withTtl("ck", 60_000, async () => ({ data: "x" }))).rejects.toThrow(/cooldown/);
      expect(calls).toBe(1);
    });

    it("recovers after the cooldown elapses", async () => {
      const cache = new CacheService(undefined, "v-cool2", { failureCooldownMs: 30 });
      let calls = 0;
      await expect(
        cache.withTtl("ck2", 60_000, async () => {
          calls += 1;
          throw new Error("down");
        }),
      ).rejects.toThrow();
      await sleep(40);
      const recovered = await cache.withTtl("ck2", 60_000, async () => {
        calls += 1;
        return { data: "recovered" };
      });
      expect(recovered).toBe("recovered");
      expect(calls).toBe(2);
    });

    it("joins an in-flight refresh instead of fast-failing behind it", async () => {
      const cache = new CacheService(undefined, "v-cool3", { failureCooldownMs: 30 });
      let calls = 0;
      const first = cache.withTtl("ck3", 60_000, async () => {
        calls += 1;
        await sleep(20);
        return { data: "slow" };
      });
      const second = cache.withTtl("ck3", 60_000, async () => {
        calls += 1;
        return { data: "never" };
      });
      const [a, b] = await Promise.all([first, second]);
      expect(a).toBe("slow");
      expect(b).toBe("slow");
      expect(calls).toBe(1);
    });
  });
});

describe("validation", () => {
  it("accepts allowlisted enums and clamps numbers", () => {
    const q = validateQuery(
      { category: "hardware", limit: "10" },
      {
        category: qEnum(["industry", "hardware"] as const, "industry"),
        limit: qNum({ default: "5", min: 1, max: 100, integer: true }),
      },
    );
    expect(q.category).toBe("hardware");
    expect(q.limit).toBe(10);
  });
  it("rejects bad enums/numbers and oversized params", () => {
    expect(() => validateQuery({ category: "evil" }, { category: qEnum(["a"] as const, "a") })).toThrow();
    expect(() => validateQuery({ n: "0x10" }, { n: qNum({ min: 0, max: 100 }) })).toThrow();
    expect(() => validateQuery({ n: "x".repeat(501) }, { n: qEnum(["x"] as const) })).toThrow();
  });
  it("takes the first value for repeated params", () => {
    const q = validateQuery(
      { category: ["hardware", "evil"] },
      {
        category: qEnum(["industry", "hardware"] as const, "industry"),
      },
    );
    expect(q.category).toBe("hardware");
  });
  it("accepts strings within maxLength and applies defaults", () => {
    expect(validateQuery({ id: "org/model" }, { id: qStr({ maxLength: 200 }) }).id).toBe("org/model");
    expect(validateQuery({}, { id: qStr({ default: "org/model" }) }).id).toBe("org/model");
    expect(() => validateQuery({ id: "x".repeat(201) }, { id: qStr({ maxLength: 200 }) })).toThrow();
  });
});

describe("runCapped pool", () => {
  it("keeps results in caller order and preserves rejection reasons", async () => {
    const boom = new Error("third");
    const results = await runCapped(
      [
        async () => "a",
        async () => "b",
        async () => {
          throw boom;
        },
        async () => "d",
      ],
      2,
    );
    expect(results[0]).toEqual({ status: "fulfilled", value: "a" });
    expect(results[1]).toEqual({ status: "fulfilled", value: "b" });
    expect(results[2]).toEqual({ status: "rejected", reason: boom });
    expect(results[3]).toEqual({ status: "fulfilled", value: "d" });
  });

  it("never runs more tasks concurrently than the cap", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(5);
      active -= 1;
    });
    await runCapped(tasks, 3);
    expect(peak).toBe(3);
  });

  it("handles the empty task list", async () => {
    await expect(runCapped([], 3)).resolves.toEqual([]);
  });
});

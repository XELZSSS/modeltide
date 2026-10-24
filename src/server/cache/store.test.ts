import { beforeEach, describe, expect, it } from "vitest";
import { ONE_DAY, ONE_MINUTE } from "@/shared/config/time";
import {
  CACHE_ENTRY_KV_TTL_S,
  L1_FALLBACK_TTL_MS,
  L1_RESIDENT_BYTES_FACTOR,
  L1_TTL_CAP_MS,
  MEMORY_CACHE_MAX_BYTES,
} from "./config";
import { KvStore } from "./kv";
import { resetModuleCachesForTests } from "./service";
import { l1TtlFor, sharedL1 } from "./l1";
import { maxStaleMs } from "./stale";
import { TierStore } from "./tier-store";

const VERSION = "v-test";
const MAX_STALE_EXTRA_MS = 60 * 60_000;

const silentLog = (): void => {};

interface SeedEntry {
  value: string;
  metadata?: unknown;
}

interface PutCall {
  key: string;
  value: string;
  expirationTtl?: number;
  metadata?: unknown;
}

function fakeKv(seed: Record<string, SeedEntry> = {}) {
  const data = new Map<string, SeedEntry>(Object.entries(seed));
  const puts: PutCall[] = [];
  const kv = new KvStore({
    async getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }> {
      const entry = data.get(key);
      return entry ? { value: entry.value, metadata: entry.metadata ?? null } : { value: null, metadata: null };
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void> {
      puts.push({ key, value, expirationTtl: options?.expirationTtl, metadata: options?.metadata });
      data.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string): Promise<void> {
      data.delete(key);
    },
  });
  return { kv, data, puts };
}

function store(version = VERSION, onDetach?: (work: Promise<unknown>) => void): TierStore {
  return new TierStore(version, sharedL1, onDetach, silentLog);
}

beforeEach(() => {
  resetModuleCachesForTests();
});

describe("TierStore.vk", () => {
  it("prefixes the key with the cache version so a deploy can invalidate every entry", () => {
    expect(store("v42").vk("aa:leaderboard")).toBe("v42:aa:leaderboard");
    expect(store("v43").vk("aa:leaderboard")).not.toBe(store("v42").vk("aa:leaderboard"));
  });
});

describe("TierStore.storeCurrent", () => {
  it("writes the payload body with expiry metadata under the versioned key and mirrors it into L1", async () => {
    const { kv, puts } = fakeKv();
    const tier = store();
    const before = Date.now();
    await tier.storeCurrent(kv, tier.vk("k1"), { n: 1 }, ONE_MINUTE);

    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe("v-test:k1");
    expect(JSON.parse(puts[0]!.value)).toEqual({ n: 1 });
    const meta = puts[0]!.metadata as { e: number; t: number };
    expect(meta.t).toBeGreaterThanOrEqual(ONE_MINUTE);
    expect(meta.t).toBeLessThanOrEqual(Math.round(ONE_MINUTE * 1.1));
    expect(Math.abs(meta.e - before - meta.t)).toBeLessThanOrEqual(5);

    const l1 = sharedL1.get<{ n: number }>("v-test:k1");
    expect(l1?.d).toEqual({ n: 1 });
    // The L1 entry owns the exact bytes the router serves, so a hit never re-encodes the payload.
    expect(l1?.s).toBe(puts[0]!.value);
    expect(l1!.e - before).toBeLessThanOrEqual(L1_TTL_CAP_MS);
  });

  it("sets expirationTtl to ceil((ttl + stale window) / 1000) inside [60, 30 days]", async () => {
    const { kv, puts } = fakeKv();
    const tier = store();
    await tier.storeCurrent(kv, tier.vk("k1"), { n: 1 }, 5 * ONE_MINUTE);

    const ttl = (puts[0]!.metadata as { t: number }).t;
    const expected = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), CACHE_ENTRY_KV_TTL_S);
    expect(puts[0]!.expirationTtl).toBe(expected);
    expect(puts[0]!.expirationTtl).toBeGreaterThanOrEqual(60);
    expect(puts[0]!.expirationTtl).toBeLessThanOrEqual(CACHE_ENTRY_KV_TTL_S);
  });

  it("clamps expirationTtl to CACHE_ENTRY_KV_TTL_S (30 days) even for a 60-day TTL", async () => {
    const { kv, puts } = fakeKv();
    const tier = store();
    await tier.storeCurrent(kv, tier.vk("k-long"), { n: 1 }, 60 * ONE_DAY);
    expect(puts[0]!.expirationTtl).toBe(CACHE_ENTRY_KV_TTL_S);
  });

  it("keeps the write memory-only when no KV binding is configured", async () => {
    const tier = store();
    await tier.storeCurrent(undefined, tier.vk("k-mem"), { n: 2 }, ONE_MINUTE);
    expect(sharedL1.get<{ n: number }>("v-test:k-mem")?.d).toEqual({ n: 2 });
  });

  it("skips the whole write instead of throwing when the payload cannot be serialized", async () => {
    const { kv, puts } = fakeKv();
    const tier = store();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(tier.storeCurrent(kv, tier.vk("k-circ"), circular, ONE_MINUTE)).resolves.toBeUndefined();
    expect(puts).toHaveLength(0);
    expect(sharedL1.get("v-test:k-circ")).toBeUndefined();
  });

  it("hands the KV write to onDetach instead of awaiting it when a detacher is installed", async () => {
    const { kv, data } = fakeKv();
    const detached: Promise<unknown>[] = [];
    const tier = store(VERSION, (work) => detached.push(work));

    await tier.storeCurrent(kv, tier.vk("k-detached"), { n: 3 }, ONE_MINUTE);
    expect(detached).toHaveLength(1);
    await Promise.all(detached);
    expect(JSON.parse(data.get("v-test:k-detached")!.value)).toEqual({ n: 3 });
  });

  it("keeps no response copy for an internal source while still writing the KV value", async () => {
    const { kv, puts } = fakeKv();
    const tier = store();

    await expect(tier.storeCurrent(kv, tier.vk("k-internal"), { n: 4 }, ONE_MINUTE, false)).resolves.toBeUndefined();

    expect(JSON.parse(puts[0]!.value)).toEqual({ n: 4 });
    const l1 = sharedL1.get<{ n: number }>("v-test:k-internal");
    expect(l1?.d).toEqual({ n: 4 });
    expect(l1?.s).toBeUndefined();
  });
});

describe("TierStore.getVersioned", () => {
  it("returns undefined for a KV value that is not valid JSON instead of throwing", async () => {
    const { kv } = fakeKv({
      "v-test:bad-json": { value: "{not json", metadata: { e: Date.now() + ONE_MINUTE, t: ONE_MINUTE } },
    });
    await expect(store().getVersioned(kv, "bad-json")).resolves.toBeUndefined();
  });

  it("returns undefined when the expiry metadata is missing or corrupt", async () => {
    const { kv } = fakeKv({
      "v-test:no-meta": { value: JSON.stringify({ n: 1 }) },
      "v-test:bad-e": { value: JSON.stringify({ n: 1 }), metadata: { e: "soon", t: ONE_MINUTE } },
      "v-test:null-meta": { value: JSON.stringify({ n: 1 }), metadata: null },
    });
    const tier = store();
    for (const k of ["no-meta", "bad-e", "null-meta"]) {
      await expect(tier.getVersioned(kv, k)).resolves.toBeUndefined();
    }
  });

  it("decodes a valid entry, returning the parsed value and the exact response body", async () => {
    const body = JSON.stringify({ n: 7 });
    const { kv } = fakeKv({ "v-test:good": { value: body, metadata: { e: 1234, t: ONE_MINUTE } } });
    const hit = await store().getVersioned<{ n: number }>(kv, "good");
    expect(hit?.env).toEqual({ d: { n: 7 }, e: 1234, t: ONE_MINUTE });
    expect(hit?.body).toBe(body);
    expect(hit?.bytes).toBe(body.length);
  });

  it("swallows a KV read failure and reports a miss", async () => {
    const failing = new KvStore({
      async getWithMetadata(): Promise<{ value: string | null; metadata: unknown }> {
        throw new Error("kv unavailable");
      },
      async put(): Promise<void> {},
      async delete(): Promise<void> {},
    });
    await expect(store().getVersioned(failing, "any")).resolves.toBeUndefined();
  });
});

describe("maxStaleMs", () => {
  it("returns min(2 * ttl + 1h, 24h)", () => {
    expect(maxStaleMs(ONE_MINUTE)).toBe(2 * ONE_MINUTE + MAX_STALE_EXTRA_MS);
    expect(maxStaleMs(60 * ONE_MINUTE)).toBe(2 * 60 * ONE_MINUTE + MAX_STALE_EXTRA_MS);
    expect(maxStaleMs(11.5 * 60 * ONE_MINUTE)).toBe(ONE_DAY);
    expect(maxStaleMs(ONE_DAY)).toBe(ONE_DAY);
    expect(maxStaleMs(30 * ONE_DAY)).toBe(ONE_DAY);
  });

  it("falls back to the bare 1h extra window for a missing or non-positive ttl", () => {
    for (const ttl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(maxStaleMs(ttl)).toBe(MAX_STALE_EXTRA_MS);
    }
  });
});

describe("l1TtlFor", () => {
  it("caps the L1 TTL at 15 minutes and defaults to 1 minute for unusable values", () => {
    expect(l1TtlFor(30_000)).toBe(30_000);
    expect(l1TtlFor(L1_TTL_CAP_MS)).toBe(L1_TTL_CAP_MS);
    expect(l1TtlFor(2 * L1_TTL_CAP_MS)).toBe(L1_TTL_CAP_MS);
    expect(l1TtlFor(ONE_DAY)).toBe(L1_TTL_CAP_MS);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(l1TtlFor(bad)).toBe(L1_FALLBACK_TTL_MS);
    }
  });
});

describe("sharedL1.set", () => {
  it("refuses a single entry whose resident size exceeds MEMORY_CACHE_MAX_BYTES", () => {
    const residentBudget = MEMORY_CACHE_MAX_BYTES / L1_RESIDENT_BYTES_FACTOR;

    expect(sharedL1.set("v-test:too-big", { n: 1 }, ONE_MINUTE, residentBudget + 1, ONE_MINUTE, "{}")).toBe(false);
    expect(sharedL1.get("v-test:too-big")).toBeUndefined();

    expect(sharedL1.set("v-test:at-limit", { n: 1 }, ONE_MINUTE, residentBudget, ONE_MINUTE, "{}")).toBe(true);
    expect(sharedL1.get<{ n: number }>("v-test:at-limit")?.d).toEqual({ n: 1 });
  });
});

describe("TTL jitter", () => {
  it("spreads the stored TTL within ±10% and keeps it stable for the same key", async () => {
    const tier = store();
    const ttl = 5 * ONE_MINUTE;

    await tier.storeCurrent(undefined, tier.vk("jitter-a"), { n: 1 }, ttl);
    await tier.storeCurrent(undefined, tier.vk("jitter-b"), { n: 2 }, ttl);

    const a = sharedL1.get("v-test:jitter-a")!.t;
    const b = sharedL1.get("v-test:jitter-b")!.t;
    for (const value of [a, b]) {
      expect(value).toBeGreaterThanOrEqual(Math.round(ttl * 0.9));
      expect(value).toBeLessThanOrEqual(Math.round(ttl * 1.1));
    }

    await tier.storeCurrent(undefined, tier.vk("jitter-a"), { n: 1 }, ttl);
    expect(sharedL1.get("v-test:jitter-a")!.t).toBe(a);
  });
});

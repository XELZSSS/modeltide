import {
  CACHE_ENTRY_KV_TTL_S,
  L1_MAX_TTL_MS,
  L1_TTL_CAP_MS,
  MEMORY_CACHE_MAX_BYTES,
  MEMORY_CACHE_MAX_KEYS,
  L1_RESIDENT_BYTES_FACTOR,
} from "./config";
import { kvReadWarnGate } from "@/server/util/throttle";
import { logger, type Logger } from "@/server/api/logger";
import { errMsg } from "@/server/api/errors";
import { fnv1aHashUint32, utf8ByteLength } from "@/server/util/hash";
import { ONE_DAY } from "@/shared/config";
import type { KvStore } from "./kv";
import { noteCacheStat } from "./stats";

const STALE_WINDOW_MS = ONE_DAY;
const MAX_STALE_EXTRA_MS = 60 * 60_000;

export function maxStaleMs(ttl: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_STALE_EXTRA_MS;
  return Math.min(2 * ttl + MAX_STALE_EXTRA_MS, STALE_WINDOW_MS);
}

export interface StaleEnvelope<T> {
  d: T;
  e: number;
  t?: number;
}

interface DecodedEnvelope<T> {
  env: StaleEnvelope<T>;
  bytes: number;
}

/**
 * Concurrent reads of one versioned key share a single KV round trip. The refresh path was already single-flighted;
 * the read path was not, so a burst on a cold key issued one KV read per request.
 */
const inflightReads = new Map<string, Promise<DecodedEnvelope<unknown> | undefined>>();

export function clearInflightReads(): void {
  inflightReads.clear();
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  if (typeof v !== "object" || v === null || !("d" in v) || !("e" in v)) return false;
  const e = (v as StaleEnvelope<T>).e;
  return typeof e === "number" && Number.isFinite(e);
}

function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  const factor = 0.9 + (fnv1aHashUint32(vk) % 201) / 1000;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

function encodeEnvelope<T>(data: T, ttl: number): string {
  return JSON.stringify({ d: data, e: Date.now() + ttl, t: ttl });
}

function decodeEnvelope<T>(raw: string, k: string, log: Logger): DecodedEnvelope<T> | undefined {
  let env: StaleEnvelope<T>;
  try {
    env = JSON.parse(raw) as StaleEnvelope<T>;
  } catch (err) {
    log("warn", `[cache] KV entry decode failed for ${k}: ${errMsg(err)}`);
    return undefined;
  }
  if (!isEnvelope<T>(env)) return undefined;
  return { env, bytes: utf8ByteLength(raw) };
}

interface MemoryEntry<T> {
  d: T;
  e: number;
  t: number;
}

class MemoryL1 {
  private map = new Map<string, { entry: MemoryEntry<unknown>; bytes: number }>();
  private bytes = 0;

  get<T>(vk: string): MemoryEntry<T> | undefined {
    const item = this.map.get(vk);
    if (!item) return undefined;
    this.map.delete(vk);
    this.map.set(vk, item);
    return item.entry as MemoryEntry<T>;
  }

  delete(vk: string): void {
    const item = this.map.get(vk);
    if (!item) return;
    this.bytes -= item.bytes;
    this.map.delete(vk);
  }

  set(vk: string, data: unknown, ttl: number, serializedBytes: number, effectiveTtl = ttl): boolean {
    this.delete(vk);
    const bytes = serializedBytes * L1_RESIDENT_BYTES_FACTOR;
    if (bytes > MEMORY_CACHE_MAX_BYTES) return false;
    // Reclaim entries that are already past every stale budget before evicting one that can still be served: they
    // hold resident bytes without being reachable through `usableStale`, so they are dead weight under pressure.
    if (this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) this.sweepDead(Date.now());
    while (this.map.size >= MEMORY_CACHE_MAX_KEYS || this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl, t: effectiveTtl }, bytes });
    this.bytes += bytes;
    return true;
  }

  private sweepDead(now: number): void {
    for (const [key, item] of this.map) {
      if (now - item.entry.e > maxStaleMs(item.entry.t)) this.delete(key);
    }
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}

export function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_MAX_TTL_MS;
  return Math.min(effective, L1_TTL_CAP_MS);
}

export const sharedL1 = new MemoryL1();

function warnKvReadFailure(log: Logger, err: unknown): void {
  if (!kvReadWarnGate.open()) return;
  log("warn", `[cache] KV read failed, degrading to refresh/stale path: ${errMsg(err)}`);
}

export class TierStore {
  private log: Logger;

  constructor(
    private version: string,
    private l1: MemoryL1,
    private onDetach?: (work: Promise<unknown>) => void,
    log?: Logger,
  ) {
    this.log = log ?? logger;
  }

  vk(k: string): string {
    return `${this.version}:${k}`;
  }

  async getVersioned<T>(kv: KvStore, k: string): Promise<DecodedEnvelope<T> | undefined> {
    const vk = this.vk(k);
    const pending = inflightReads.get(vk) as Promise<DecodedEnvelope<T> | undefined> | undefined;
    if (pending) {
      noteCacheStat("kvReadsCoalesced");
      return pending;
    }
    const work = this.readVersioned<T>(kv, vk);
    inflightReads.set(vk, work as Promise<DecodedEnvelope<unknown> | undefined>);
    try {
      return await work;
    } finally {
      if (inflightReads.get(vk) === (work as unknown)) inflightReads.delete(vk);
    }
  }

  private async readVersioned<T>(kv: KvStore, vk: string): Promise<DecodedEnvelope<T> | undefined> {
    let raw: string | null;
    noteCacheStat("kvReads");
    try {
      raw = await kv.get(vk);
    } catch (err) {
      noteCacheStat("kvReadFailures");
      warnKvReadFailure(this.log, err);
      return undefined;
    }
    if (!raw) return undefined;
    return decodeEnvelope<T>(raw, vk, this.log);
  }

  async storeCurrent<T>(kv: KvStore | undefined, vk: string, data: T, ttl: number): Promise<void> {
    const effective = jitteredTtl(vk, ttl);
    let serialized: string | undefined;
    try {
      serialized = encodeEnvelope(data, effective);
    } catch (err) {
      this.log("warn", `[cache] serialize failed for ${vk}: ${errMsg(err)}`);
    }
    if (serialized === undefined) return;
    // The L1 lifetime must not depend on whether KV is bound: without KV an entry kept its full TTL (up to
    // 6 h) in the same isolate instead of being re-read. Cap it, and keep the jittered TTL as the stale budget.
    const cached = this.l1.set(vk, data, l1TtlFor(effective), utf8ByteLength(serialized), effective);
    if (!cached) this.log("warn", `[cache] L1 skipped oversized entry for ${vk}`);
    if (!kv) return;
    const put = this.setSerialized(kv, vk, serialized, effective).catch((err: unknown) => {
      this.log("warn", `[cache] KV write failed for ${vk}: ${errMsg(err)}`);
    });
    if (this.onDetach) this.onDetach(put);
    else await put;
  }

  private async setSerialized(kv: KvStore, k: string, serialized: string, ttl: number): Promise<void> {
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), CACHE_ENTRY_KV_TTL_S);
    noteCacheStat("kvWrites");
    await kv.put(k, serialized, { expirationTtl });
  }
}

import {
  CACHE_ENTRY_KV_TTL_S,
  L1_MAX_TTL_MS,
  L1_TTL_CAP_MS,
  MEMORY_CACHE_MAX_BYTES,
  MEMORY_CACHE_MAX_KEYS,
} from "@/server/config";
import { L1_RESIDENT_BYTES_FACTOR } from "@/server/config/cache";
import { kvReadWarnGate } from "@/server/infra/throttle";
import { logger, type Logger } from "@/server/infra/logger";
import { errMsg } from "@/server/infra/errors";
import { fnv1aHashUint32, utf8ByteLength } from "@/server/infra/hash";
import { ONE_DAY } from "@/shared/config";
import type { KvStore } from "./kv";

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

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  if (typeof v !== "object" || v === null || !("d" in v) || !("e" in v)) return false;
  const e = (v as StaleEnvelope<T>).e;
  return typeof e === "number" && Number.isFinite(e);
}

export function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  const h1 = (fnv1aHashUint32(vk) % 50) / 1000;
  const factor = 0.95 + h1;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

function encodeEnvelope<T>(data: T, ttl: number): string {
  return JSON.stringify({ d: data, e: Date.now() + ttl, t: ttl });
}

function decodeEnvelope<T>(raw: string, k: string, log: Logger): { env: StaleEnvelope<T>; bytes: number } | undefined {
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

export class MemoryL1 {
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
    while (this.map.size >= MEMORY_CACHE_MAX_KEYS || this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl, t: effectiveTtl }, bytes });
    this.bytes += bytes;
    return true;
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

  async getVersioned<T>(kv: KvStore, k: string): Promise<{ env: StaleEnvelope<T>; bytes: number } | undefined> {
    let raw: string | null;
    try {
      raw = await kv.get(this.vk(k));
    } catch (err) {
      warnKvReadFailure(this.log, err);
      return undefined;
    }
    if (!raw) return undefined;
    return decodeEnvelope<T>(raw, this.vk(k), this.log);
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
    const cached = this.l1.set(vk, data, kv ? l1TtlFor(effective) : effective, utf8ByteLength(serialized), effective);
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
    await kv.put(k, serialized, { expirationTtl });
  }
}

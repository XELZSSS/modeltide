import { L1_MAX_TTL_MS, MEMORY_CACHE_MAX_BYTES, MEMORY_CACHE_MAX_KEYS, ONE_DAY } from "@/shared/config";
import { fnv1aHash, utf8ByteLength } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";

const STALE_WINDOW_MS = ONE_DAY;

interface StaleEnvelope<T> {
  d: T;
  e: number;
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

export class MemoryL1 {
  private map = new Map<string, { envelope: StaleEnvelope<unknown>; bytes: number }>();
  private bytes = 0;

  get<T>(vk: string): StaleEnvelope<T> | undefined {
    const entry = this.map.get(vk);
    if (!entry) return undefined;
    if (!isEnvelope<T>(entry.envelope)) {
      this.delete(vk);
      return undefined;
    }
    this.map.delete(vk);
    this.map.set(vk, entry);
    return entry.envelope as StaleEnvelope<T>;
  }

  delete(vk: string): void {
    const entry = this.map.get(vk);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.map.delete(vk);
  }

  set(vk: string, data: unknown, ttl: number, bytes: number): void {
    this.delete(vk);
    if (bytes > MEMORY_CACHE_MAX_BYTES) return;
    if (this.map.size >= MEMORY_CACHE_MAX_KEYS) {
      const now = Date.now();
      for (const [k, e] of this.map) {
        if (e.envelope.e <= now) this.delete(k);
        if (this.map.size < MEMORY_CACHE_MAX_KEYS) break;
      }
      if (this.map.size >= MEMORY_CACHE_MAX_KEYS) {
        const oldest = this.map.keys().next();
        if (!oldest.done) this.delete(oldest.value);
      }
    }
    while (this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.map.set(vk, { envelope: { d: data, e: Date.now() + ttl }, bytes });
    this.bytes += bytes;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}

export class InflightRegistry {
  private map = new Map<string, Promise<unknown>>();

  get<T>(vk: string): Promise<T> | undefined {
    return this.map.get(vk) as Promise<T> | undefined;
  }

  run<T>(vk: string, p: Promise<T>): Promise<T> {
    this.map.set(vk, p);
    return p;
  }

  release(vk: string, p: Promise<unknown>): void {
    if (this.map.get(vk) === p) this.map.delete(vk);
  }

  clear(): void {
    this.map.clear();
  }
}

const sharedL1 = new MemoryL1();
const sharedInflight = new InflightRegistry();

function jitteredTtl(vk: string, ttl: number): number {
  const hashPart = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const randomPart = Math.random() * 0.1;
  const factor = 0.95 + hashPart + randomPart;
  return Math.max(60_000, Math.round(ttl * factor));
}

export function resetModuleCachesForTests(): void {
  sharedL1.clear();
  sharedInflight.clear();
  refreshFailureCooldown.clear();
}

const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;
const refreshFailureCooldown = new Map<string, number>();

export interface CacheStores {
  l1?: MemoryL1;
  inflight?: InflightRegistry;
  failureCooldownMs?: number;
}

export class CacheService {
  private l1: MemoryL1;
  private inflight: InflightRegistry;
  private failureCooldownMs: number;

  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
    stores?: CacheStores,
  ) {
    this.l1 = stores?.l1 ?? sharedL1;
    this.inflight = stores?.inflight ?? sharedInflight;
    this.failureCooldownMs = stores?.failureCooldownMs ?? FAILURE_COOLDOWN_MS;
  }

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async getWithBytes<T>(k: string): Promise<{ env: StaleEnvelope<T>; bytes: number } | undefined> {
    if (!this.kv) return undefined;
    const raw = await this.kv.get(k, { type: "text" });
    if (!raw) return undefined;
    let env: StaleEnvelope<T>;
    try {
      env = JSON.parse(raw) as StaleEnvelope<T>;
    } catch {
      return undefined;
    }
    return { env, bytes: utf8ByteLength(raw) };
  }

  private async setSerialized(k: string, serialized: string, ttl: number): Promise<void> {
    if (!this.kv) return;
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + STALE_WINDOW_MS) / 1000), 60), 2592000);
    await this.kv.put(k, serialized, { expirationTtl });
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const vk = this.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!this.kv) {
      if (!mem) return this.refresh(vk, ttl, fn);
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        return mem.d;
      }
    }
    const hit = await this.getWithBytes<T>(vk);
    if (!hit || !isEnvelope<T>(hit.env)) {
      return this.refresh(vk, ttl, fn);
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, Math.min(hit.env.e - Date.now(), L1_MAX_TTL_MS), hit.bytes);
      return hit.env.d;
    }
    try {
      return await this.refresh(vk, ttl, fn);
    } catch {
      return hit.env.d;
    }
  }

  private async refresh<T>(vk: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const existing = this.inflight.get<T>(vk);
    if (existing) return existing;
    const lastFailAt = refreshFailureCooldown.get(vk);
    if (lastFailAt != null) {
      if (Date.now() - lastFailAt < this.failureCooldownMs) {
        throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${vk}`);
      }
      refreshFailureCooldown.delete(vk);
    }
    const hasKv = this.kv != null;
    const p = this.inflight.run(
      vk,
      (async () => {
        const { data, ttl: t } = await fn();
        const requested = t ?? ttl;
        const effective = jitteredTtl(vk, Number.isFinite(requested) && requested > 0 ? requested : ttl);
        try {
          const serialized = JSON.stringify({ d: data, e: Date.now() + effective });
          const bytes = utf8ByteLength(serialized);
          this.l1.set(vk, data, hasKv ? Math.min(effective, L1_MAX_TTL_MS) : effective, bytes);
          await this.setSerialized(vk, serialized, effective);
        } catch {}
        return data;
      })(),
    );
    try {
      return await p;
    } catch (err) {
      const now = Date.now();
      refreshFailureCooldown.set(vk, now);
      if (refreshFailureCooldown.size > FAILURE_COOLDOWN_MAX_KEYS) {
        for (const [k, t] of refreshFailureCooldown) {
          if (now - t >= this.failureCooldownMs) refreshFailureCooldown.delete(k);
        }
      }
      throw err;
    } finally {
      this.inflight.release(vk, p);
    }
  }
}

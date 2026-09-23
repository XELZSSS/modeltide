import { ONE_DAY } from "@/shared/config";
import { fnv1aHash, utf8ByteLength } from "@/server/infra/hash";

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
  // Deterministic jitter (no Math.random) so the :00/:30 herd is still broken.
  const h1 = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const factor = 0.95 + h1;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

export function encodeEnvelope<T>(data: T, ttl: number): string {
  return JSON.stringify({ d: data, e: Date.now() + ttl, t: ttl });
}

export function decodeEnvelope<T>(raw: string): { env: StaleEnvelope<T>; bytes: number } | undefined {
  let env: StaleEnvelope<T>;
  try {
    env = JSON.parse(raw) as StaleEnvelope<T>;
  } catch {
    return undefined;
  }
  if (!isEnvelope<T>(env)) return undefined;
  return { env, bytes: utf8ByteLength(raw) };
}

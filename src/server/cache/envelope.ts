import { errMsg } from "@/server/api/errors";
import type { Logger } from "@/server/api/logger";
import { fnv1aHashUint32, utf8ByteLength } from "@/server/util/hash";

export interface StaleEnvelope<T> {
  d: T;
  e: number;
  t?: number;
}

export interface DecodedEnvelope<T> {
  env: StaleEnvelope<T>;
  bytes: number;
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  if (typeof v !== "object" || v === null || !("d" in v) || !("e" in v)) return false;
  const e = (v as StaleEnvelope<T>).e;
  return typeof e === "number" && Number.isFinite(e);
}

export function encodeEnvelope<T>(data: T, ttl: number): string {
  return JSON.stringify({ d: data, e: Date.now() + ttl, t: ttl });
}

export function decodeEnvelope<T>(raw: string, k: string, log: Logger): DecodedEnvelope<T> | undefined {
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

/** Spreads a TTL by ±10% so a whole cache generation does not expire in one burst. */
export function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  const factor = 0.9 + (fnv1aHashUint32(vk) % 201) / 1000;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

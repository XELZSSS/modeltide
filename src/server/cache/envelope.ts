import { errMsg } from "@/server/api/errors";
import type { Logger } from "@/server/api/logger";
import { fnv1aHashUint32, utf8ByteLength } from "@/server/util/hash";
import { isFiniteNumber } from "@/shared/utils/number";

/** What the stale logic needs from one stored entry, whichever tier it came from. */
export interface StoredEnvelope<T> {
  d: T;
  /** When the entry stops being fresh (epoch ms). */
  e: number;
  /** The TTL the entry was stored with, jitter included; the stale budgets are derived from it. */
  t?: number;
}

export interface DecodedEnvelope<T> {
  env: StoredEnvelope<T>;
  /** The exact bytes the response body is served from. */
  body: string;
  bytes: number;
}

export interface KvEntryMetadata {
  e: number;
  t: number;
}

/**
 * KV keeps the expiry in metadata rather than inside the value, which is what lets the value be the response body
 * itself. Metadata is written by `kvMetadata`; anything else (a legacy key, a truncated write) is a miss, not a guess.
 */
export function parseKvMetadata(metadata: unknown): KvEntryMetadata | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const { e, t } = metadata as { e?: unknown; t?: unknown };
  if (!isFiniteNumber(e) || !isFiniteNumber(t)) return undefined;
  return { e, t };
}

export function kvMetadata(expiresAt: number, ttl: number): KvEntryMetadata {
  return { e: expiresAt, t: ttl };
}

/**
 * Decodes one KV value: the body is parsed for composition (a parent source reads it as a payload) and kept verbatim
 * for the response, so a hit never re-serializes the object it just parsed.
 */
export function decodeStored<T>(
  body: string,
  metadata: unknown,
  k: string,
  log: Logger,
): DecodedEnvelope<T> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    log("warn", `[cache] KV entry decode failed for ${k}: ${errMsg(err)}`);
    return undefined;
  }
  const meta = parseKvMetadata(metadata);
  if (meta === undefined) {
    log("warn", `[cache] KV entry has no usable expiry metadata for ${k}`);
    return undefined;
  }
  return { env: { d: parsed as T, e: meta.e, t: meta.t }, body, bytes: utf8ByteLength(body) };
}

/** Spreads a TTL by ±10% so a whole cache generation does not expire in one burst. */
export function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  const factor = 0.9 + (fnv1aHashUint32(vk) % 201) / 1000;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

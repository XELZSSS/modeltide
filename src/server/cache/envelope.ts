import { errMsg } from "@/server/api/errors";
import type { Logger } from "@/server/api/logger";
import { fnv1aHashUint32 } from "@/server/util/hash";
import { isFiniteNumber } from "@/shared/utils/number";

/** What the stale logic needs from one stored entry, whichever tier it came from. */
interface StoredEnvelope<T> {
  d: T;
  /** When the entry stops being fresh (epoch ms). */
  e: number;
  /**
   * The TTL the entry was stored with, jitter included; the stale budgets are derived from it. Required: `putEntry`
   * always writes it, and `parseKvMetadata` answers an entry without one as a miss rather than a guess.
   */
  t: number;
  /** When the payload was produced (epoch ms) — the ETag's basis, which the response body no longer carries. */
  f: number;
}

export interface DecodedEnvelope<T> {
  env: StoredEnvelope<T>;
  /** The exact bytes the response body is served from. */
  body: string;
  /**
   * Resident-size estimate for the L1 byte budget, in code units rather than UTF-8 bytes: the only consumer evicts
   * by a 4× resident factor, and measuring the real byte length is a full scan of a multi-MB body on every KV hit.
   */
  bytes: number;
}

interface KvEntryMetadata {
  e: number;
  t: number;
  f: number;
}

/**
 * KV keeps the expiry in metadata rather than inside the value, which is what lets the value be the response body
 * itself. Metadata is written by `kvMetadata`; anything else (a legacy key, a truncated write) is a miss, not a guess.
 */
function parseKvMetadata(metadata: unknown): KvEntryMetadata | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const { e, t, f } = metadata as { e?: unknown; t?: unknown; f?: unknown };
  if (!isFiniteNumber(e) || !isFiniteNumber(t) || !isFiniteNumber(f)) return undefined;
  return { e, t, f };
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
  return { env: { d: parsed as T, e: meta.e, t: meta.t, f: meta.f }, body, bytes: body.length };
}

/** Spreads a TTL by ±10% so a whole cache generation does not expire in one burst. */
export function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  const factor = 0.9 + (fnv1aHashUint32(vk) % 201) / 1000;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

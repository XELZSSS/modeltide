import { ONE_MINUTE } from "@/shared/config/time";

export const MEMORY_CACHE_MAX_KEYS = 200;
export const MEMORY_CACHE_MAX_BYTES = 32 * 1024 * 1024;
/** Resident estimate for the parsed value alone: about three times its serialized size. */
export const L1_OBJECT_BYTES_FACTOR = 3;
/** The serialized response body, when the entry keeps one. */
export const L1_BODY_BYTES_FACTOR = 1;
/**
 * Resident estimate for one entry that serves a response: the parsed object plus the body copy. An internal source —
 * one whose payload is only composed into another source — skips the body and is accounted at `L1_OBJECT_BYTES_FACTOR`.
 */
export const L1_RESIDENT_BYTES_FACTOR = L1_OBJECT_BYTES_FACTOR + L1_BODY_BYTES_FACTOR;
export const L1_TTL_CAP_MS = 15 * 60_000;
/** Stand-in TTL when a caller's TTL is unusable (0, negative, NaN, ∞): keep the entry briefly instead of skipping L1. */
export const L1_FALLBACK_TTL_MS = ONE_MINUTE;

export const CACHE_ENTRY_KV_TTL_S = 30 * 24 * 60 * 60;

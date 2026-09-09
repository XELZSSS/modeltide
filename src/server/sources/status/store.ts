import type { AppContext } from "@/server/context";
import type { DayBucket, UptimeSample } from "@/shared/types";
import { API_DOMAINS } from "@/shared/config";
import { HISTORY_KV_RETENTION_TTL_S } from "@/server/config";
import { mergeSample, type HistoryStore, type SourceId } from "@/server/sources/status/windows";
import { aggregateProbes, probeTargets, type SourceAggregate } from "@/server/sources/status/probe";
import { fetchProviderStatuses } from "@/server/sources/provider-status";

export const SAMPLE_LOCK_TTL_S = 120;
// Stable across deploys by design: locks are ephemeral, versions must not orphan them.
export const SAMPLE_LOCK_KEY = `${API_DOMAINS.statusHistory}:lock`;

export function isValidSample(s: unknown): s is UptimeSample {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const r = s as Record<string, unknown>;
  return typeof r.t === "number" && Number.isFinite(r.t) && typeof r.ok === "boolean";
}
export function isValidBucket(b: unknown): b is DayBucket {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const r = b as Record<string, unknown>;
  return typeof r.day === "string" && typeof r.total === "number" && typeof r.ok === "number";
}

export async function acquireSampleLock(ctx: AppContext): Promise<string | null> {
  if (!ctx.kv) return "memory";
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const token = `${Date.now()}:${rand.toString(36)}`;
  const expiresAt = Date.now() + SAMPLE_LOCK_TTL_S * 1000;
  const value = `${token}:${expiresAt}`;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held) {
      const parts = held.split(":");
      const heldExpiry = Number(parts[parts.length - 1]);
      if (Number.isFinite(heldExpiry) && heldExpiry > Date.now()) return null;
    }
    await ctx.kv.put(SAMPLE_LOCK_KEY, value, { expirationTtl: SAMPLE_LOCK_TTL_S });
    return token;
  } catch {
    return null;
  }
}

export async function releaseSampleLock(ctx: AppContext, token: string | null): Promise<void> {
  if (!ctx.kv || !token || token === "memory") return;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && held.startsWith(`${token}:`)) {
      await ctx.kv.delete(SAMPLE_LOCK_KEY);
    }
  } catch {}
}

// Stable across deploys by design: history must survive version bumps and is
// never dropped by a key change. This is the one deliberately un-versioned
// key in the system.
export const HISTORY_KEY = API_DOMAINS.statusHistory;
/** Raw copies of unsalvageable payloads, kept (with TTL) for manual recovery. */
export const HISTORY_BACKUP_KEY = `${HISTORY_KEY}:backup`;
/**
 * One-time bridge from a generation when this key had no TTL and a versioned
 * name. The only remaining writer of it died in 2026-09; once the copy is
 * adopted (and the raw key deleted) the bridge is dead code to remove.
 */
const LEGACY_HISTORY_KEY = "v1:status-history";

let memoryStore: HistoryStore = { sources: {} };

/**
 * Stable key first (steady state: exactly 1 KV read); the bridge key is only
 * consulted when the stable key is missing.
 */
async function collectHistoryRaws(kv: NonNullable<AppContext["kv"]>): Promise<{ key: string; raw: string }[]> {
  const raws: { key: string; raw: string }[] = [];
  const stableRaw = await kv.get(HISTORY_KEY);
  if (stableRaw != null) return [{ key: HISTORY_KEY, raw: stableRaw }];
  const legacyRaw = await kv.get(LEGACY_HISTORY_KEY).catch(() => null);
  if (legacyRaw != null) raws.push({ key: LEGACY_HISTORY_KEY, raw: legacyRaw });
  return raws;
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  let raws: { key: string; raw: string }[];
  try {
    raws = await collectHistoryRaws(ctx.kv);
  } catch {
    return memoryStore;
  }
  for (const { key, raw } of raws) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const salvaged = salvageStore(parsed);
      if (salvaged) {
        if (key !== HISTORY_KEY) {
          // One-time adoption: copy the bridged store to the stable key (with
          // the retention TTL it never had) and drop the legacy key so it is
          // never read again.
          try {
            await ctx.kv.put(HISTORY_KEY, JSON.stringify(salvaged), { expirationTtl: HISTORY_KV_RETENTION_TTL_S });
            await ctx.kv.delete(key);
          } catch {}
        }
        return salvaged;
      }
    } catch {
      continue;
    }
  }
  if (raws.length === 0) return { sources: {} };
  // Nothing salvageable: back up the raw payloads before clearing the keys so
  // they aren't re-parsed forever. The next cron sample rebuilds from scratch,
  // but the last copy of history survives for manual recovery.
  try {
    await ctx.kv.put(HISTORY_BACKUP_KEY, JSON.stringify(raws.map((r) => r.raw)).slice(0, 24 * 1024 * 1024), {
      expirationTtl: HISTORY_KV_RETENTION_TTL_S,
    });
    await Promise.all(raws.map(({ key }) => ctx.kv!.delete(key)));
  } catch {}
  return { sources: {} };
}

/** Drop unreadable per-source entries, keep readable ones. `null` when nothing survives. */
function salvageStore(parsed: unknown): HistoryStore | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sources = (parsed as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return null;
  const out: HistoryStore["sources"] = {};
  for (const [id, entry] of Object.entries(sources as Record<string, unknown>)) {
    if (entry == null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) continue;
    const { recent, daily } = entry as { recent?: unknown; daily?: unknown };
    if (!Array.isArray(recent) || !Array.isArray(daily)) continue;
    if (!recent.every(isValidSample) || !daily.every(isValidBucket)) continue;
    out[id as SourceId] = { recent, daily };
  }
  return Object.keys(out).length > 0 ? { sources: out } : null;
}

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<void> {
  const token = await acquireSampleLock(ctx);
  if (!token) return;
  try {
    const [probed, providerResults] = await Promise.all([probeTargets(ctx), fetchProviderStatuses(ctx)]);
    const aggregates = aggregateProbes(probed);
    for (const [id, result] of providerResults) {
      aggregates.set(id, {
        ok: result.ok,
        status: result.status,
        latencyMs: result.ok ? result.latencyMs : null,
        error: result.error,
      });
    }
    await mergeSamplesIntoStore(ctx, aggregates, now);
  } finally {
    await releaseSampleLock(ctx, token);
  }
}

export async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now = Date.now(),
): Promise<HistoryStore> {
  const store = await readStore(ctx);
  // Fully unknown round (every probe skipped): nothing decisive to record, so don't
  // write at all — ids keep their previous samples and no spurious events are derived.
  if (aggregates.size === 0) return store;
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      { t: now, ok: agg.ok, latencyMs: agg.latencyMs, status: agg.status, error: agg.error },
      now,
    );
  }
  if (!ctx.kv) {
    memoryStore = store;
    return store;
  }
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify(store), { expirationTtl: HISTORY_KV_RETENTION_TTL_S });
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] KV write failed, serving memory: ${err instanceof Error ? err.message : String(err)}`,
    );
    memoryStore = store;
  }
  return store;
}

export async function ensureFreshSamples(ctx: AppContext): Promise<HistoryStore> {
  let store: HistoryStore;
  try {
    store = await readStore(ctx);
  } catch {
    return memoryStore;
  }
  if (ctx.kv) warnStaleSamples(ctx, store);
  return store;
}

// Two missed 30-minute cron rounds is already anomalous; throttle so the read
// path (30s payload cache) doesn't spam the log while the outage persists.
export const STALE_SAMPLE_WARN_MS = 2 * 60 * 60 * 1000;
const STALE_WARN_THROTTLE_MS = 30 * 60 * 1000;
let lastStaleWarnAt = 0;

/** Timestamp of the newest sample across all sources (0 when the store is empty). */
export function latestSampleAt(store: HistoryStore): number {
  let latest = 0;
  for (const entry of Object.values(store.sources)) {
    const t = entry?.recent.at(-1)?.t ?? 0;
    if (t > latest) latest = t;
  }
  return latest;
}

function warnStaleSamples(ctx: AppContext, store: HistoryStore): void {
  const now = Date.now();
  const latest = latestSampleAt(store);
  if (latest === 0 || now - latest <= STALE_SAMPLE_WARN_MS) return;
  if (now - lastStaleWarnAt < STALE_WARN_THROTTLE_MS) return;
  lastStaleWarnAt = now;
  ctx.log("warn", "[status-history] samples are stale: sampling cron may be dead", {
    latestSampleAt: new Date(latest).toISOString(),
    ageHours: Math.round((now - latest) / 3_600_000),
  });
}

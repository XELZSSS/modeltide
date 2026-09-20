import { API_DOMAINS } from "@/shared/config";
import { HISTORY_KV_RETENTION_TTL_S } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { DayBucket, UptimeSample } from "@/shared/types";
import { fetchProviderStatuses } from "@/server/sources/provider-status";
import {
  mergeSample,
  type HistorySourceEntry,
  type HistoryStore,
  type SourceId,
} from "./history-math";
import { aggregateProbes, probeTargets, type ProbeTarget, type SourceAggregate } from "./probe";

export type { HistorySourceEntry, HistoryStore, SourceId, ProbeTarget, SourceAggregate };

const SAMPLE_LOCK_TTL_S = 120;
export const SAMPLE_LOCK_KEY = `${API_DOMAINS.statusHistory}:lock`;

function isValidSample(s: unknown): s is UptimeSample {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const r = s as Record<string, unknown>;
  return typeof r.t === "number" && Number.isFinite(r.t) && typeof r.ok === "boolean";
}
function isValidBucket(b: unknown): b is DayBucket {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const r = b as Record<string, unknown>;
  return typeof r.day === "string" && typeof r.total === "number" && typeof r.ok === "number";
}

async function acquireSampleLock(ctx: AppContext): Promise<string | null> {
  if (!ctx.kv) return "memory";
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const token = `${Date.now()}:${rand.toString(36)}`;
  const expiresAt = Date.now() + SAMPLE_LOCK_TTL_S * 1000;
  const value = `${token}:${expiresAt}`;
  const isLiveLock = (held: string): boolean => {
    const heldExpiry = Number(held.split(":").at(-1));
    return Number.isFinite(heldExpiry) && heldExpiry > Date.now();
  };
  // Best-effort lock: KV is eventually consistent with no CAS, so duplicate
  // samples are tolerated downstream via the 2-minute upsert window in
  // mergeSample. No confirm-delay sleep on the cron critical path.
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && isLiveLock(held)) return null;
    await ctx.kv.put(SAMPLE_LOCK_KEY, value, { expirationTtl: SAMPLE_LOCK_TTL_S });
    return token;
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] sample lock acquire failed, skipping round: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function releaseSampleLock(ctx: AppContext, token: string | null): Promise<void> {
  if (!ctx.kv || !token || token === "memory") return;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && held.startsWith(`${token}:`)) {
      await ctx.kv.delete(SAMPLE_LOCK_KEY);
    }
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] sample lock release failed, leaving to TTL expiry: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export const HISTORY_KEY = API_DOMAINS.statusHistory;
let memoryStore: HistoryStore = { sources: {} };

const KV_READ_WARN_THROTTLE_MS = 30 * 60 * 1000;
let lastKvReadWarnAt = 0;

function warnKvReadFailure(ctx: AppContext, err: unknown): void {
  const now = Date.now();
  if (now - lastKvReadWarnAt < KV_READ_WARN_THROTTLE_MS) return;
  lastKvReadWarnAt = now;
  ctx.log(
    "warn",
    `[status-history] KV read failed, serving memory: ${err instanceof Error ? err.message : String(err)}`,
  );
}

export function resetStatusWarnThrottleForTests(): void {
  lastKvReadWarnAt = 0;
  lastStaleWarnAt = 0;
  memoryStore = { sources: {} };
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  let raw: string | null;
  try {
    raw = await ctx.kv.get(HISTORY_KEY);
  } catch (err) {
    warnKvReadFailure(ctx, err);
    return memoryStore;
  }
  if (raw == null) return Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} };
  try {
    const salvaged = salvageStore(JSON.parse(raw));
    if (salvaged) return salvaged;
  } catch {
    // Corrupt payload: drop it so the next cron starts clean.
    // No backup retained by design — CACHE_VERSION hard-cuts stale shapes.
  }
  try {
    await ctx.kv.delete(HISTORY_KEY);
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] corrupt history clear failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} };
}

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

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<boolean | null> {
  const token = await acquireSampleLock(ctx);
  if (!token) return null;
  try {
    const [probed, providerResults] = await Promise.all([probeTargets(ctx), fetchProviderStatuses(ctx)]);
    const aggregates = aggregateProbes(probed);
    for (const [id, result] of providerResults) {
      aggregates.set(id, {
        ok: result.ok,
        ...(result.warn ? { warn: true } : {}),
        status: result.status,
        latencyMs: result.ok ? result.latencyMs : null,
        error: result.error,
      });
    }
    if (aggregates.size === 0) return false;
    await mergeSamplesIntoStore(ctx, aggregates, now);
    return true;
  } finally {
    await releaseSampleLock(ctx, token);
  }
}

async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now = Date.now(),
): Promise<HistoryStore> {
  const store = await readStore(ctx);
  if (aggregates.size === 0) return store;
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      {
        t: now,
        ok: agg.ok,
        latencyMs: agg.latencyMs,
        status: agg.status,
        error: agg.error,
        ...(agg.warn ? { warn: true } : {}),
      },
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

const STALE_SAMPLE_WARN_MS = 2 * 60 * 60 * 1000;
const STALE_WARN_THROTTLE_MS = 30 * 60 * 1000;
let lastStaleWarnAt = 0;

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

export function staleSampleMessage(store: HistoryStore, now = Date.now()): string | null {
  const latest = latestSampleAt(store);
  if (latest === 0 || now - latest <= STALE_SAMPLE_WARN_MS) return null;
  return `[status-history] samples are stale: sampling cron may be dead (ageHours=${Math.round((now - latest) / 3_600_000)})`;
}

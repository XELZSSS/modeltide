import type { AppContext } from "@/server/context";
import { API_DOMAINS, CACHE_VERSION } from "@/shared/config";
import type { DayBucket, UptimeSample } from "@/shared/types";
import { mergeSample, type HistoryStore, type SourceId } from "@/server/sources/status/windows";
import { aggregateProbes, probeTargets, type SourceAggregate } from "@/server/sources/status/probe";
import { fetchProviderStatuses } from "@/server/sources/provider-status";

export const HISTORY_KEY = `${CACHE_VERSION}:${API_DOMAINS.statusHistory}`;

const SAMPLE_LOCK_TTL_S = 120;
export const SAMPLE_LOCK_KEY = `${CACHE_VERSION}:${API_DOMAINS.statusHistory}:lock`;

let memoryStore: HistoryStore = { sources: {} };

async function acquireSampleLock(ctx: AppContext): Promise<string | null> {
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
    return token;
  }
}

async function releaseSampleLock(ctx: AppContext, token: string | null): Promise<void> {
  if (!ctx.kv || !token || token === "memory") return;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && held.startsWith(`${token}:`)) {
      await ctx.kv.delete(SAMPLE_LOCK_KEY);
    }
  } catch {}
}

function isValidSample(s: unknown): s is UptimeSample {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const r = s as Record<string, unknown>;
  return typeof r.t === "number" && Number.isFinite(r.t) && typeof r.ok === "boolean";
}

function isValidBucket(b: unknown): b is DayBucket {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.day === "string" &&
    typeof r.total === "number" &&
    typeof r.ok === "number" &&
    typeof r.latencySum === "number" &&
    typeof r.latencyN === "number" &&
    typeof r.incidents === "number"
  );
}

function isValidStoreShape(v: unknown): v is HistoryStore {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const sources = (v as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return false;
  for (const entry of Object.values(sources as Record<string, unknown>)) {
    if (entry == null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) return false;
    const { recent, daily } = entry as { recent?: unknown; daily?: unknown };
    if (!Array.isArray(recent) || !Array.isArray(daily)) return false;
    if (!recent.every(isValidSample) || !daily.every(isValidBucket)) return false;
  }
  return true;
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  let raw: string | null;
  try {
    raw = await ctx.kv.get(HISTORY_KEY);
  } catch {
    return memoryStore;
  }
  if (!raw) return { sources: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoreShape(parsed)) throw new Error("invalid shape");
    return parsed;
  } catch {
    ctx.kv.delete(HISTORY_KEY).catch(() => {});
    return { sources: {} };
  }
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
    await ctx.kv.put(HISTORY_KEY, JSON.stringify(store));
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
  try {
    return await readStore(ctx);
  } catch {
    return memoryStore;
  }
}

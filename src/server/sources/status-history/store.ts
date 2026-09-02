import type { AppContext } from "@/server/context";
import { probeTargets, aggregateProbes, type SourceAggregate } from "@/server/sources/probe";
import { getUptime } from "@/server/sources/uptime";
import type { SourceStatus } from "@/shared/types";
import { SOURCE_IDS } from "@/shared/config";
import type { HistoryStore, SourceId } from "./types";
import { HISTORY_KEY, SAMPLE_INTERVAL_MS, SAMPLE_LOCK_TTL_S } from "./types";
import { mergeSample } from "./merge";
import { buildHistoryPayload } from "./payload";

const SAMPLE_LOCK_KEY = "status:history:lock";

// In-memory fallback when KV is not configured (graceful degradation per docs)
// Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — env.CACHE is undefined when kv_namespaces is not configured
let memoryStore: HistoryStore = { sources: {} };

async function acquireSampleLock(ctx: AppContext): Promise<boolean> {
  if (!ctx.kv) return true;
  const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
  if (held) return false;
  await ctx.kv.put(SAMPLE_LOCK_KEY, "1", { expirationTtl: SAMPLE_LOCK_TTL_S });
  return true;
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  const raw = await ctx.kv.get(HISTORY_KEY);
  return raw ? (JSON.parse(raw) as HistoryStore) : { sources: {} };
}

function newestSampleTime(store: HistoryStore): number {
  let newest = 0;
  for (const entry of Object.values(store.sources)) {
    const last = entry?.recent[entry.recent.length - 1];
    if (last && last.t > newest) newest = last.t;
  }
  return newest;
}

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<void> {
  if (!(await acquireSampleLock(ctx))) return;
  const probed = await probeTargets(ctx);
  await mergeSamplesIntoStore(ctx, aggregateProbes(probed), now);
}

export async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now = Date.now(),
): Promise<HistoryStore> {
  const store = await readStore(ctx);
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(store.sources[id], { t: now, ok: agg.ok, latencyMs: agg.latencyMs, status: agg.status, error: agg.error }, now);
  }
  if (!ctx.kv) {
    memoryStore = store;
    return store;
  }
  await ctx.kv.put(HISTORY_KEY, JSON.stringify(store));
  return store;
}

export async function ensureFreshSamples(ctx: AppContext): Promise<HistoryStore> {
  let store = await readStore(ctx);
  if (newestSampleTime(store) < Date.now() - SAMPLE_INTERVAL_MS) {
    await recordStatusSamples(ctx);
    store = await readStore(ctx);
  }
  return store;
}

export async function getStatusHistory(ctx: AppContext) {
  const store = await ensureFreshSamples(ctx);
  const uptime = await getUptime(ctx);
  return buildHistoryPayload(store, uptime, Date.now());
}

export function statusFromStore(store: HistoryStore, now = Date.now()): { sources: SourceStatus[]; checkedAt: string } {
  const ids: SourceId[] = [...SOURCE_IDS];
  let newest = 0;
  const sources = ids.map((id): SourceStatus => {
    const entry = store.sources[id];
    const last = entry?.recent[entry.recent.length - 1];
    if (last) newest = Math.max(newest, last.t);
    return last
      ? {
          id,
          ok: last.ok,
          status: last.status ?? null,
          latencyMs: last.latencyMs,
          error: last.ok ? null : (last.error ?? "probe failed"),
          checkedAt: new Date(last.t).toISOString(),
        }
      : { id, ok: false, status: null, latencyMs: null, error: "no samples yet", checkedAt: new Date(now).toISOString() };
  });
  return { sources, checkedAt: new Date(newest || now).toISOString() };
}

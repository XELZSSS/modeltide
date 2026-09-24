import { ONE_MINUTE } from "@/shared/config";
import {
  HISTORY_KV_RETENTION_TTL_S,
  KV_READ_WARN_THROTTLE_MS,
  SAMPLE_LOCK_TTL_S,
  SAMPLE_SELF_HEAL_MS,
  STALE_SAMPLE_WARN_MS,
  STALE_WARN_THROTTLE_MS,
  throttleGate,
} from "@/server/config/status";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/task-pool";
import type { SourceId } from "@/shared/types";
import { fetchProviderStatuses, PROVIDER_STATUS_TARGET_COUNT } from "@/server/sources/incident-source";
import { mergeSample } from "./history-math";
import { aggregateProbes, probeTargets, type SourceAggregate } from "./probe";
import { HISTORY_KEY, HISTORY_SCHEMA_VERSION, SAMPLE_LOCK_KEY, salvageStore, type HistoryStore } from "./schema";

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
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && isLiveLock(held)) return null;
    await ctx.kv.put(SAMPLE_LOCK_KEY, value, { expirationTtl: SAMPLE_LOCK_TTL_S });
    return token;
  } catch (err) {
    ctx.log("warn", `[status-history] sample lock acquire failed: ${errMsg(err)}`);
    throw err;
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
    ctx.log("warn", `[status-history] sample lock release failed, leaving to TTL expiry: ${errMsg(err)}`);
  }
}

let memoryStore: HistoryStore = { sources: {} };

const memoryOrEmpty = (): HistoryStore => (Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} });

const kvReadWarnGate = throttleGate(KV_READ_WARN_THROTTLE_MS);

const staleWarnGate = throttleGate(STALE_WARN_THROTTLE_MS);

function warnKvReadFailure(ctx: AppContext, err: unknown): void {
  if (!kvReadWarnGate.open()) return;
  ctx.log("warn", `[status-history] KV read failed, serving memory: ${errMsg(err)}`);
}

interface StoreRead {
  store: HistoryStore;
  canWriteToKv: boolean;
}

async function readStoreResult(ctx: AppContext): Promise<StoreRead> {
  if (!ctx.kv) return { store: memoryStore, canWriteToKv: false };
  let raw: string | null;
  try {
    raw = await ctx.kv.get(HISTORY_KEY);
  } catch (err) {
    warnKvReadFailure(ctx, err);
    return { store: memoryStore, canWriteToKv: false };
  }
  if (raw == null) return { store: memoryOrEmpty(), canWriteToKv: true };
  try {
    const salvaged = salvageStore(JSON.parse(raw));
    if (salvaged) return { store: salvaged, canWriteToKv: true };
  } catch {}
  try {
    await ctx.kv.delete(HISTORY_KEY);
  } catch (err) {
    ctx.log("warn", `[status-history] corrupt history clear failed: ${errMsg(err)}`);
  }
  return { store: memoryOrEmpty(), canWriteToKv: Object.keys(memoryStore.sources).length === 0 };
}

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<boolean | null> {
  const token = await acquireSampleLock(ctx);
  if (!token) {
    ctx.log("info", "[status-history] round skipped: sample lock held by another invocation");
    return null;
  }
  try {
    const [probed, providerResults] = await Promise.all([probeTargets(ctx), fetchProviderStatuses(ctx)]);
    if (probed.length === 0) ctx.log("warn", "[status-history] probe leg returned no results");
    if (providerResults.size === 0) ctx.log("warn", "[status-history] provider-status leg returned no results");
    const aggregates = aggregateProbes(probed);
    for (const [id, result] of providerResults) {
      aggregates.set(id, {
        ok: result.ok,
        ...(result.warn ? { warn: true, warnReason: result.warnReason } : {}),
        status: result.status,
        latencyMs: result.ok ? result.latencyMs : null,
        error: result.error,
      });
    }
    if (aggregates.size === 0) {
      ctx.log("warn", "[status-history] round produced no samples (probes aborted or all upstreams unreachable)");
      return false;
    }
    const providersComplete = providerResults.size === PROVIDER_STATUS_TARGET_COUNT;
    if (!providersComplete) {
      ctx.log(
        "warn",
        `[status-history] provider status incomplete (${providerResults.size}/${PROVIDER_STATUS_TARGET_COUNT})`,
      );
    }
    const persisted = await mergeSamplesIntoStore(ctx, aggregates, now);
    ctx.log("info", `[status-history] round recorded for ${aggregates.size} sources`);
    return persisted && providerResults.size > 0;
  } finally {
    await releaseSampleLock(ctx, token);
  }
}

function entrySampleAt(entry: HistoryStore["sources"][SourceId] | undefined): number {
  return entry?.recent.at(-1)?.t ?? 0;
}

function mergeStoreSnapshots(current: HistoryStore, candidate: HistoryStore): HistoryStore {
  const sources: HistoryStore["sources"] = {};
  for (const id of new Set([...Object.keys(current.sources), ...Object.keys(candidate.sources)] as SourceId[])) {
    const currentEntry = current.sources[id];
    const candidateEntry = candidate.sources[id];
    if (!currentEntry) {
      if (candidateEntry) sources[id] = candidateEntry;
    } else if (!candidateEntry || entrySampleAt(currentEntry) >= entrySampleAt(candidateEntry)) {
      sources[id] = currentEntry;
    } else {
      sources[id] = candidateEntry;
    }
  }
  return { sources };
}

async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now: number,
): Promise<boolean> {
  const firstRead = await readStoreResult(ctx);
  const store = firstRead.store;
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
        ...(agg.warnReason != null ? { warnReason: agg.warnReason } : {}),
      },
      now,
    );
  }
  if (!ctx.kv) {
    memoryStore = store;
    return true;
  }
  if (!firstRead.canWriteToKv) {
    memoryStore = store;
    return false;
  }

  const latest = await readStoreResult(ctx);
  if (!latest.canWriteToKv) {
    memoryStore = store;
    return false;
  }
  const merged = mergeStoreSnapshots(latest.store, store);
  memoryStore = merged;
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify({ v: HISTORY_SCHEMA_VERSION, ...merged }), {
      expirationTtl: HISTORY_KV_RETENTION_TTL_S,
    });
    return true;
  } catch (err) {
    ctx.log("warn", `[status-history] KV write failed, serving memory: ${errMsg(err)}`);
    return false;
  }
}

interface FreshSamples {
  store: HistoryStore;
  persisted: boolean;
}

export async function ensureFreshSamplesWithHealth(ctx: AppContext): Promise<FreshSamples> {
  const firstRead = await readStoreResult(ctx);
  const store = firstRead.store;
  const latest = latestSampleAt(store);
  if (ctx.kv) warnStaleSamples(ctx, latest);
  const now = Date.now();
  if (latest > 0 && now - latest > SAMPLE_SELF_HEAL_MS) {
    ctx.log(
      "info",
      `[status-history] ${Math.round((now - latest) / ONE_MINUTE)} min without samples, running self-heal round`,
    );
    if (ctx.onDetach) {
      ctx.onDetach(
        recordStatusSamples(ctx, now).then(undefined, (err: unknown) => {
          ctx.log("warn", `[status-history] detached self-heal round failed: ${errMsg(err)}`);
        }),
      );
      return { store, persisted: false };
    }
    try {
      await recordStatusSamples(ctx, now);
      const after = await readStoreResult(ctx);
      return { store: after.store, persisted: after.canWriteToKv };
    } catch (err) {
      ctx.log("warn", `[status-history] self-heal round failed, serving existing history: ${errMsg(err)}`);
      return { store, persisted: firstRead.canWriteToKv };
    }
  }
  return { store, persisted: firstRead.canWriteToKv };
}

function latestSampleAt(store: HistoryStore): number {
  let latest = 0;
  for (const entry of Object.values(store.sources)) {
    const t = entry?.recent.at(-1)?.t ?? 0;
    if (t > latest) latest = t;
  }
  return latest;
}

function warnStaleSamples(ctx: AppContext, latest: number): void {
  const now = Date.now();
  if (latest === 0 || now - latest <= STALE_SAMPLE_WARN_MS) return;
  if (!staleWarnGate.open()) return;
  ctx.log("warn", "[status-history] samples are stale: sampling cron may be dead", {
    latestSampleAt: new Date(latest).toISOString(),
    ageHours: Math.round((now - latest) / 3_600_000),
  });
}

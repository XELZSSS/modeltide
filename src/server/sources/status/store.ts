import { ONE_MINUTE } from "@/shared/config";
import {
  HISTORY_KV_RETENTION_TTL_S,
  SAMPLE_LOCK_TTL_S,
  SAMPLE_SELF_HEAL_MS,
  STALE_SAMPLE_WARN_MS,
  STALE_WARN_THROTTLE_MS,
} from "@/server/config/status";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";
import { throttleGate } from "@/server/infra/throttle";
import type { SourceId } from "@/shared/types";
import { fetchProviderStatuses, PROVIDER_STATUS_TARGET_COUNT } from "@/server/sources/incident-source";
import type { SourceAggregate } from "./aggregate";
import { mergeSample } from "./history-math";
import { aggregateProbes, probeTargets } from "./probe";
import { HISTORY_KEY, HISTORY_SCHEMA_VERSION, SAMPLE_LOCK_KEY, type HistoryStore } from "./schema";
import { acquireSampleLock, releaseSampleLock } from "./sample-lock";
import { readStoreResult, setMemoryStore } from "./store-read";

const staleWarnGate = throttleGate(STALE_WARN_THROTTLE_MS);
const selfHealGate = throttleGate(SAMPLE_LOCK_TTL_S * 1000);

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
    for (const [id, agg] of providerResults) aggregates.set(id, agg);
    if (aggregates.size === 0) {
      ctx.log("warn", "[status-history] round produced no samples (probes aborted or all upstreams unreachable)");
      return false;
    }
    // Every upstream failing at once is a local budget hit, not an outage;
    // persisting it would open false incidents for every source.
    const anyReachable = [...aggregates.values()].some((agg) => agg.ok);
    if (!anyReachable) {
      ctx.log(
        "warn",
        "[status-history] round discarded: every source failed, treating as local sampling failure, not an outage",
      );
      return false;
    }
    const providersComplete = providerResults.size === PROVIDER_STATUS_TARGET_COUNT;
    if (!providersComplete) {
      ctx.log(
        "warn",
        `[status-history] provider status incomplete (${providerResults.size}/${PROVIDER_STATUS_TARGET_COUNT})`,
      );
    }
    const persisted = await mergeSamplesIntoStore(ctx, aggregates, now, token);
    ctx.log("info", `[status-history] round recorded for ${aggregates.size} sources`);
    return persisted && probed.length > 0 && providersComplete;
  } finally {
    await releaseSampleLock(ctx, token);
  }
}

async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now: number,
  token: string,
): Promise<boolean> {
  const { store, canWriteToKv } = await readStoreResult(ctx);
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      {
        t: now,
        ok: agg.ok,
        latencyMs: agg.latencyMs,
        status: agg.status,
        error: agg.error,
        warn: agg.warn,
        warnReason: agg.warnReason,
      },
      now,
    );
  }
  setMemoryStore(store);
  if (!ctx.kv) return true;
  if (!canWriteToKv) return false;
  const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
  if (!held || !held.startsWith(`${token}:`)) {
    ctx.log("warn", "[status-history] sample lock lost before persist, discarding round");
    return false;
  }
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify({ v: HISTORY_SCHEMA_VERSION, ...store }), {
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
}

export async function ensureFreshSamplesWithHealth(ctx: AppContext): Promise<FreshSamples> {
  const firstRead = await readStoreResult(ctx);
  const store = firstRead.store;
  const latest = latestSampleAt(store);
  if (ctx.kv) warnStaleSamples(ctx, latest);
  const now = Date.now();
  const ageMs = latest > 0 ? now - latest : null;
  if (ageMs !== null && ageMs <= SAMPLE_SELF_HEAL_MS) return { store };
  if (!selfHealGate.open()) return { store };
  const reason = ageMs === null ? "no samples recorded yet" : `${Math.round(ageMs / ONE_MINUTE)} min without samples`;
  ctx.log("info", `[status-history] ${reason}, running self-heal round`);
  if (ctx.onDetach) {
    ctx.onDetach(
      recordStatusSamples(ctx, now).then(undefined, (err: unknown) => {
        ctx.log("warn", `[status-history] detached self-heal round failed: ${errMsg(err)}`);
      }),
    );
    return { store };
  }
  try {
    await recordStatusSamples(ctx, now);
    const after = await readStoreResult(ctx);
    return { store: after.store };
  } catch (err) {
    ctx.log("warn", `[status-history] self-heal round failed, serving existing history: ${errMsg(err)}`);
    return { store };
  }
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
  ctx.log("warn", "[status-history] samples are stale: background sampling may be delayed", {
    latestSampleAt: new Date(latest).toISOString(),
    ageHours: Math.round((now - latest) / 3_600_000),
  });
}

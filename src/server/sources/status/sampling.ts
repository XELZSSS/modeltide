import type { AppContext } from "@/server/context";
import type { SourceId } from "@/shared/types";
import { fetchProviderStatuses, PROVIDER_STATUS_TARGET_COUNT } from "@/server/sources/incident-source";
import type { SourceAggregate } from "./aggregate";
import { mergeSamplesIntoStore } from "./persistence";
import { aggregateProbes, probeTargets } from "./probe";
import { acquireSampleLock, releaseSampleLock } from "./sample-lock";

function checkRoundHealth(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
): boolean {
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
  return true;
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
    for (const [id, agg] of providerResults) aggregates.set(id, agg);
    if (!checkRoundHealth(ctx, aggregates)) return false;
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

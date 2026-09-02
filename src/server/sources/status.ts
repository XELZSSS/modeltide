import type { AppContext } from "@/server/context";
import type { SourcesStatusPayload } from "@/shared/types";
import { getUptime } from "@/server/sources/uptime";
import { probeTargets, aggregateProbes } from "@/server/sources/probe";
import { ensureFreshSamples, mergeSamplesIntoStore, statusFromStore } from "@/server/sources/status-history/store";

// Live status is derived from the same probe samples the cron history recorder
// already produces, so a status request never re-probes upstream on its own (the
// old dedicated probe round + KV write per warm tick is gone). `refresh=1` is the
// only path that probes live, and it feeds its results back into the history.

async function checkSourcesLive(ctx: AppContext) {
  const now = Date.now();
  const aggregates = aggregateProbes(await probeTargets(ctx));
  const store = await mergeSamplesIntoStore(ctx, aggregates, now);
  return statusFromStore(store, now);
}

export const getSourcesStatus = async (ctx: AppContext) => statusFromStore(await ensureFreshSamples(ctx));

export const getSourcesStatusFull = async (ctx: AppContext, refresh: boolean): Promise<SourcesStatusPayload> => {
  const status = refresh ? await checkSourcesLive(ctx) : await getSourcesStatus(ctx);
  const uptime = await getUptime(ctx);
  return { ...status, ...uptime };
};

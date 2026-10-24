import { isRecord } from "@/server/formats/scalars";
import { ONE_HOUR } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { UpstreamError, wrapUpstream } from "@/server/api/errors";

import { mapModels, type RankingScanStats } from "./parse-rankings";
import { getModelDirectory } from "./directory";
import type { DirectoryCacheEntry } from "./parse-directory";
import { runLegs } from "@/server/join-legs";
import { defineSource, requireArrayBody, requireRows } from "@/server/pipeline";

const RANKINGS_DRIFT_RATIO = 0.1;

interface OpenRouterRaw {
  rows: unknown[];
  totalRows: number;
  stats: RankingScanStats;
  directory: SourcePayload<DirectoryCacheEntry> | undefined;
}

/**
 * How long a rankings payload may stay cached at the origin. `src/server/registry.ts` reads this same constant for the
 * route's HTTP cache headers, so the edge window cannot drift from the origin window.
 */
export const OPENROUTER_RANKINGS_TTL_MS = ONE_HOUR;

const openRouterSource = defineSource<OpenRouterRaw, OpenRouterRankEntry[]>({
  key: cacheKeys.openRouterRankings,
  ttl: OPENROUTER_RANKINGS_TTL_MS,
  label: "OpenRouter rankings",
  served: true,
  fetch: async (ctx) => {
    const { values, failures } = await runLegs([
      {
        label: "rankings",
        run: () =>
          ctx.http.getJson<{ data: unknown[] }>(
            upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings),
          ),
      },
      { label: "directory", run: () => getModelDirectory(ctx) },
    ]);
    const rankingsFailure = failures.find((f) => f.label === "rankings");
    if (rankingsFailure) {
      throw wrapUpstream("OpenRouter: rankings fetch failed", rankingsFailure.reason);
    }
    const rankings: unknown = values[0];
    if (!isRecord(rankings)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    const rows = requireArrayBody(upstreamEndpoints.openRouterRankings, rankings.data, "OpenRouter rankings");
    const totalRows = rows.length;
    const stats: RankingScanStats = { scannedRows: 0, validRows: 0, expiredRows: 0 };
    return { rows, totalRows, stats, directory: values[1] };
  },
  parse: (raw) => {
    const directory = raw.directory?.data;
    const models = mapModels(raw.rows, directory?.pricing ?? {}, raw.stats, directory?.meta);
    if (raw.stats.validRows === 0) {
      throw new UpstreamError(`OpenRouter: all ${raw.totalRows} ranking rows had invalid model_permaslug`);
    }
    const liveRows = raw.stats.validRows - raw.stats.expiredRows;
    if (models.length === 0 && liveRows > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${liveRows} live rows`);
    }
    return requireRows(models, "OpenRouter rankings", "rows");
  },
  partialWhen: ({ raw }) => {
    const droppedRows = raw.totalRows - raw.stats.validRows;
    const drift = droppedRows >= Math.max(1, Math.ceil(raw.totalRows * RANKINGS_DRIFT_RATIO));
    const pricingCount = Object.keys(raw.directory?.data.pricing ?? {}).length;
    const directoryPartial = raw.directory == null || raw.directory.partial;
    const partial = pricingCount === 0 || drift || directoryPartial;
    return {
      partial,
      log: partial
        ? {
            pricing: pricingCount,
            dropped: droppedRows,
            totalRows: raw.totalRows,
            directoryPartial,
          }
        : undefined,
    };
  },
});

export const getOpenRouterRankings = (ctx: AppContext): Promise<SourcePayload<OpenRouterRankEntry[]>> =>
  openRouterSource(ctx);

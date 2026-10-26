import { isRecord } from "@/server/formats/scalars";
import { ONE_HOUR } from "@/shared/config";
import type { ServedPayload } from "@/server/served-payload";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { OpenRouterRankEntry } from "@/shared/types";
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
  directory: ServedPayload<DirectoryCacheEntry> | undefined;
}

export const getOpenRouterRankings = defineSource<OpenRouterRaw, OpenRouterRankEntry[]>({
  key: cacheKeys.openRouterRankings,
  ttl: ONE_HOUR,
  label: "OpenRouter rankings",
  served: true,
  fetch: async (ctx) => {
    const { values, failures } = await runLegs([
      {
        label: "rankings",
        // The body is `unknown` because the wire shape is decided below: declaring `{ data: unknown[] }` here made the
        // type argument claim a validation that had not happened yet.
        run: () => ctx.http.json<unknown>(upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings)),
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
    const stats: RankingScanStats = {
      scannedRows: 0,
      validRows: 0,
      expiredRows: 0,
      ratioFormChanges: 0,
      percentFormChanges: 0,
    };
    return { rows, totalRows, stats, directory: values[1] };
  },
  parse: (raw, ctx) => {
    const directory = raw.directory?.payload.data;
    const models = mapModels(raw.rows, directory?.pricing ?? {}, raw.stats, directory?.meta);
    // Both readings of the ambiguous `change` unit were needed inside one payload: the trends on this page are then
    // scaled by two different factors. Reported rather than partial — a ratio above 1 is legitimate, so this is the
    // signal to go check the upstream, not a verdict that the payload is broken.
    if (raw.stats.ratioFormChanges > 0 && raw.stats.percentFormChanges > 0) {
      ctx.log("warn", "[openrouter] change figures read in both forms", {
        ratioForm: raw.stats.ratioFormChanges,
        percentForm: raw.stats.percentFormChanges,
      });
    }
    if (raw.stats.validRows === 0) {
      throw new UpstreamError(`OpenRouter: all ${raw.totalRows} ranking rows had invalid model_permaslug`);
    }
    // `expiredRows` counts retired groups while `validRows` counts ranking rows, so the two are reported side by side
    // rather than subtracted: the guard is about a payload that parsed but produced no model at all.
    if (models.length === 0 && raw.stats.expiredRows < raw.stats.validRows) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${raw.stats.validRows} ranking rows`);
    }
    return requireRows(models, "OpenRouter rankings", "rows");
  },
  partialWhen: ({ raw }) => {
    const droppedRows = raw.totalRows - raw.stats.validRows;
    const drift = droppedRows >= Math.max(1, Math.ceil(raw.totalRows * RANKINGS_DRIFT_RATIO));
    const pricingCount = Object.keys(raw.directory?.payload.data.pricing ?? {}).length;
    const directoryPartial = raw.directory == null || raw.directory.payload.partial;
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

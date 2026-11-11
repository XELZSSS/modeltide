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
        // The body is `unknown` because the wire shape is decided below: declaring `{ data: unknown[] }` here would claim a validation that had not happened.
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
    const stats: RankingScanStats = { validRows: 0, expiredRows: 0 };
    return { rows, totalRows, stats, directory: values[1] };
  },
  parse: (raw) => {
    const directory = raw.directory?.payload.data;
    const models = mapModels(raw.rows, directory?.pricing ?? {}, raw.stats, directory?.meta);
    if (raw.stats.validRows === 0) {
      throw new UpstreamError(`OpenRouter: all ${raw.totalRows} ranking rows had invalid model_permaslug`);
    }
    // `expiredRows` counts retired groups while `validRows` counts ranking rows: the two are reported side by side, and the guard is about a payload that produced no model at all.
    if (models.length === 0 && raw.stats.expiredRows < raw.stats.validRows) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${raw.stats.validRows} ranking rows`);
    }
    return requireRows(models, "OpenRouter rankings", "rows");
  },
  partialWhen: ({ raw }) => {
    const droppedRows = raw.totalRows - raw.stats.validRows;
    const drift = droppedRows >= Math.max(1, Math.ceil(raw.totalRows * RANKINGS_DRIFT_RATIO));
    // The directory leg is optional, so an absent one counts as no pricing; a present one carries the key count it counted while filing.
    const pricingCount = raw.directory?.payload.data.pricingKeys ?? 0;
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

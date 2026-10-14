import { isRecord } from "@/server/parsers/parser-primitives";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { upstreamUrl } from "@/server/config/upstream";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, wrapUpstream } from "@/server/infra/errors";

import { mapModels, type RankingScanStats } from "@/server/parsers/openrouter-ranking-parser";
import type { ModelRow } from "@/server/parsers/upstream-types";
import { getModelDirectory, type DirectoryCacheEntryWithPartial } from "@/server/sources/openrouter-directory";
import { runLegs } from "@/server/sources/join-legs";
import { defineSource, requireArrayBody } from "@/server/sources/pipeline";

const RANKINGS_DRIFT_RATIO = 0.1;

interface OpenRouterRaw {
  rows: ModelRow[];
  totalRows: number;
  stats: RankingScanStats;
  dirData: DirectoryCacheEntryWithPartial;
}

const openRouterSource = defineSource<OpenRouterRaw, OpenRouterRankEntry>({
  key: cacheKeys.openRouterRankings,
  ttl: DEFAULT_TTL_MS,
  label: "OpenRouter rankings",
  fetch: async (ctx) => {
    const { values, failures } = await runLegs([
      {
        label: "rankings",
        run: () =>
          ctx.http.getJson<{ data: ModelRow[] }>(
            upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings),
          ),
      },
      { label: "directory", run: () => getModelDirectory(ctx) },
    ]);
    const rankingsFailure = failures.find((f) => f.label === "rankings");
    if (rankingsFailure) {
      throw wrapUpstream("OpenRouter: rankings fetch failed", rankingsFailure.reason);
    }
    const rankings = values[0] as unknown as { data?: unknown };
    if (!isRecord(rankings)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    const rows = requireArrayBody(
      upstreamEndpoints.openRouterRankings,
      rankings.data,
      "OpenRouter rankings",
    ) as ModelRow[];
    const totalRows = rows.length;
    const dirData = values[1] ?? ({ pricing: {}, meta: {}, partial: true } as DirectoryCacheEntryWithPartial);
    const stats: RankingScanStats = { scannedRows: 0, validRows: 0 };
    return { rows, totalRows, stats, dirData };
  },
  parse: (raw) => {
    const models = mapModels(raw.rows, raw.dirData.pricing, raw.stats);
    if (raw.stats.validRows === 0) {
      throw new UpstreamError(`OpenRouter: all ${raw.totalRows} ranking rows had invalid model_permaslug`);
    }
    if (models.length === 0 && raw.stats.validRows > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${raw.stats.validRows} rows`);
    }
    return models;
  },
  partialWhen: ({ raw }) => {
    const droppedRows = raw.totalRows - raw.stats.validRows;
    const drift = droppedRows >= Math.max(1, Math.ceil(raw.totalRows * RANKINGS_DRIFT_RATIO));
    const pricingCount = Object.keys(raw.dirData.pricing).length;
    const partial = pricingCount === 0 || drift || raw.dirData.partial;
    return {
      partial,
      log: partial
        ? {
            pricing: pricingCount,
            dropped: droppedRows,
            totalRows: raw.totalRows,
            directoryPartial: raw.dirData.partial,
          }
        : undefined,
    };
  },
});

export const getOpenRouterRankings = (ctx: AppContext): Promise<SourcePayload<OpenRouterRankEntry[]>> =>
  openRouterSource(ctx);

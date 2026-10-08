import { isRecord } from "@/server/parsers/parser-primitives";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, wrapUpstream } from "@/server/infra/errors";
import { logPartial } from "@/server/infra/logger";

import { mapModels, type RankingScanStats } from "@/server/parsers/openrouter-ranking-parser";
import type { ModelRow } from "@/server/parsers/upstream-types";
import { getModelDirectory, type DirectoryCacheEntryWithPartial } from "@/server/sources/openrouter-directory";
import { runLegs } from "@/server/sources/join-legs";
import { cachedPayload, requireArrayBody } from "@/server/sources/pipeline";

const RANKINGS_DRIFT_RATIO = 0.1;

export const getOpenRouterRankings = (ctx: AppContext): Promise<SourcePayload<OpenRouterRankEntry[]>> =>
  cachedPayload(ctx, cacheKeys.openRouterRankings, DEFAULT_TTL_MS, async (ctx) => {
    const { values, failures } = await runLegs([
      {
        label: "rankings",
        run: () =>
          ctx.http.json<{ data: ModelRow[] }>(
            upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings),
            UPSTREAM_FETCH_OPTS,
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
    const models = mapModels(rows, dirData.pricing, stats);
    if (stats.validRows === 0) {
      throw new UpstreamError(`OpenRouter: all ${totalRows} ranking rows had invalid model_permaslug`);
    }
    const droppedRows = totalRows - stats.validRows;
    const drift = droppedRows >= Math.max(1, Math.ceil(totalRows * RANKINGS_DRIFT_RATIO));
    const pricingCount = Object.keys(dirData.pricing).length;
    const partialFailure = pricingCount === 0 || drift || dirData.partial;
    if (partialFailure) {
      logPartial(ctx.log, "openrouter", {
        pricing: pricingCount,
        dropped: droppedRows,
        totalRows,
        directoryPartial: dirData.partial,
      });
    }
    if (models.length === 0 && stats.validRows > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${stats.validRows} rows`);
    }
    return { rows: models, partial: partialFailure };
  });

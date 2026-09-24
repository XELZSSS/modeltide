import { isRecord, isValidRowId } from "@/server/parsers/parser-primitives";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, wrapUpstream } from "@/server/infra/errors";

import { mapModels, type PricingEntry } from "@/server/parsers/openrouter-parser";
import type { ModelMetaEntry, ModelRow } from "@/server/parsers/upstream-types";
import { getModelDirectory } from "@/server/sources/openrouter-directory";
import { runLegs } from "@/server/sources/join-legs";
import { cachedPayload } from "@/server/sources/pipeline";

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
    if (!isRecord(rankings) || !Array.isArray(rankings.data)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    if (rankings.data.length === 0) {
      throw new UpstreamError("OpenRouter: rankings upstream returned empty array");
    }
    if (rankings.data.length > 20_000) {
      ctx.log("warn", `[openrouter] rankings oversized (${rankings.data.length}), truncating`);
    }
    const validRows = (rankings.data as unknown[])
      .slice(0, 20_000)
      .filter((r) => isRecord(r) && isValidRowId((r as unknown as ModelRow).model_permaslug)) as ModelRow[];
    if (validRows.length === 0 && rankings.data.length > 0) {
      throw new UpstreamError(`OpenRouter: all ${rankings.data.length} ranking rows had invalid model_permaslug`);
    }
    const droppedRows = rankings.data.length - validRows.length;
    const rankingsSchemaDrift = droppedRows >= Math.max(1, Math.ceil(rankings.data.length * RANKINGS_DRIFT_RATIO));
    const dirData =
      values[1] ??
      ({ pricing: {}, meta: {} } as {
        pricing: Record<string, PricingEntry>;
        meta: Record<string, ModelMetaEntry>;
        partial?: boolean;
      });
    const pricingMap = new Map(Object.entries(dirData.pricing));
    const partialFailure = pricingMap.size === 0 || rankingsSchemaDrift || dirData.partial === true;
    if (partialFailure) {
      if (pricingMap.size === 0) {
        ctx.log("warn", "[openrouter] directory empty, serving rankings without pricing");
      } else if (rankingsSchemaDrift) {
        ctx.log(
          "warn",
          `[openrouter] upstream schema drift detected (${droppedRows}/${rankings.data.length} rows dropped), serving a partial payload`,
        );
      } else {
        ctx.log("warn", "[openrouter] directory reported partial pricing, serving a partial payload");
      }
    }
    const models = mapModels(validRows, pricingMap);
    if (models.length === 0 && validRows.length > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${validRows.length} rows`);
    }
    return { rows: models, partial: partialFailure };
  });

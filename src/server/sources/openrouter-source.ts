import { isRecord, isValidRowId } from "@/server/parsers/parser-primitives";
import { DEFAULT_TTL_MS, ttlFor } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { OpenRouterRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, wrapUpstream } from "@/server/infra/errors";

import { mapModels, type ModelMetaEntry, type PricingEntry } from "@/server/parsers/openrouter-parser";
import type { ModelRow } from "@/server/parsers/upstream-types";
import { getModelDirectory } from "@/server/sources/openrouter-directory";
import { cachedSource } from "@/server/sources/pipeline";

export const getOpenRouterRankings = (ctx: AppContext): Promise<OpenRouterRankingsPayload> =>
  cachedSource(ctx, cacheKeys.openRouterRankings, DEFAULT_TTL_MS, async () => {
    const [rankingsRes, directoryRes] = await Promise.allSettled([
      ctx.http.json<{ data: ModelRow[] }>(
        `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterRankings}`,
        UPSTREAM_FETCH_OPTS,
      ),
      getModelDirectory(ctx),
    ]);
    if (rankingsRes.status === "rejected") {
      throw wrapUpstream("OpenRouter: rankings fetch failed", rankingsRes.reason);
    }
    const rankings = rankingsRes.value as unknown as { data?: unknown };
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
    const dirData =
      directoryRes.status === "fulfilled"
        ? directoryRes.value
        : ({ pricing: {}, meta: {} } as {
            pricing: Record<string, PricingEntry>;
            meta: Record<string, ModelMetaEntry>;
          });
    const pricingMap = new Map(Object.entries(dirData.pricing));
    const partialFailure = pricingMap.size === 0;
    if (partialFailure) {
      ctx.log("warn", "[openrouter] directory empty, serving rankings without pricing");
    }
    const models = mapModels(validRows, pricingMap);
    if (models.length === 0 && validRows.length > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${validRows.length} rows`);
    }
    return {
      value: {
        tokenUsageRankings: models,
        fetchedAt: new Date().toISOString(),
        ...(partialFailure ? { partial: true } : {}),
      },
      ttl: ttlFor(partialFailure),
    };
  });

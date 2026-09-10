import { DEFAULT_TTL_MS, ttlFor } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { OpenRouterRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg, settled } from "@/server/infra/pool";
import { isValidRowId } from "@/server/parsers/data-filter";
import type { ModelRow, PricingEntry, ModelMetaEntry } from "@/server/parsers/or-types";
import { mapModels } from "@/server/parsers/or-rankings";
import { getModelDirectory } from "@/server/sources/openrouter/directory";

export const getOpenRouterRankings = (ctx: AppContext): Promise<OpenRouterRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.openRouterRankings, DEFAULT_TTL_MS, async () => {
    const [rankingsRes, directoryRes] = await Promise.allSettled([
      ctx.http.json<{ data: ModelRow[] }>(
        `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterRankings}`,
        UPSTREAM_FETCH_OPTS,
      ),
      getModelDirectory(ctx),
    ]);
    if (rankingsRes.status === "rejected") {
      throw new UpstreamError(`OpenRouter: all upstream requests failed (${errMsg(rankingsRes.reason)})`);
    }
    const rankings = rankingsRes.value;
    if (!Array.isArray(rankings?.data)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    if (rankings.data.length === 0) {
      throw new UpstreamError("OpenRouter: rankings upstream returned empty array");
    }
    const validRows = rankings.data.filter((r) => isValidRowId(r.model_permaslug));
    if (validRows.length === 0 && rankings.data.length > 0) {
      throw new UpstreamError(`OpenRouter: all ${rankings.data.length} ranking rows had invalid model_permaslug`);
    }
    const dirData = settled(directoryRes, { pricing: {}, meta: {} } as {
      pricing: Record<string, PricingEntry>;
      meta: Record<string, ModelMetaEntry>;
    });
    const pricingMap = new Map(Object.entries(dirData.pricing));
    const partialFailure = pricingMap.size === 0;
    if (partialFailure) {
      ctx.log("warn", "[openrouter] directory empty, serving rankings without pricing");
    }
    // Served in full: detail pages and search resolve against this list.
    const models = mapModels(validRows, pricingMap);
    if (models.length === 0 && validRows.length > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${validRows.length} rows`);
    }
    return {
      data: {
        tokenUsageRankings: models,
        fetchedAt: new Date().toISOString(),
        ...(partialFailure ? { partial: true } : {}),
      },
      ttl: ttlFor(partialFailure),
    };
  });

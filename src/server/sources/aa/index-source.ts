import { byNumberDesc, isValidModelIdentity } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { parseRscPayloads, findNextData } from "@/server/parsers/rsc-parser";
import { zeroUpstream } from "@/server/infra/errors";

import { getModelDirectory } from "@/server/sources/openrouter-directory";
import {
  backfillFromMeta,
  buildWeightsRecord,
  compact,
  compactOmniscienceEnrich,
  findModelArray,
  mergeBySlug,
  type IntelligenceIndexResult,
} from "@/server/parsers/aa";
import { fetchAaRsc, fetchAndParseEnrich } from "@/server/sources/aa/aa-fetch";
import type { SourcePayload } from "@/shared/types";
import { upstreamEndpoints } from "@/server/config";
import { cachedSource } from "@/server/sources/pipeline";

async function fetchIntelligenceIndex(ctx: AppContext): Promise<Omit<IntelligenceIndexResult, "fetchedAt">> {
  const [indexBody, [modelsPageModels, omniscienceEnrich], openRouterMeta] = await Promise.all([
    fetchAaRsc(ctx, upstreamEndpoints.aaIndex),
    Promise.all([
      fetchAndParseEnrich<Record<string, unknown>>(
        ctx,
        "/models",
        upstreamEndpoints.aaModels,
        "initialModels",
        (tree) => findNextData(tree, "initialModels"),
      ),
      fetchAndParseEnrich<Record<string, unknown>>(
        ctx,
        "/omniscience",
        upstreamEndpoints.aaOmniscience,
        "initialModels",
        (tree) => {
          const arr = findNextData<Record<string, unknown>>(tree, "initialModels");
          return Array.isArray(arr) && arr.some((m) => m.omniscienceBreakdown != null) ? arr : null;
        },
        (arr) => arr.map(compactOmniscienceEnrich),
      ),
    ]),
    getModelDirectory(ctx)
      .then((d) => d.meta)
      .catch(() => ({}) as Record<string, import("@/server/parsers/openrouter-parser").ModelMetaEntry>),
  ]);

  const [indexModels, catalog] = parseRscPayloads(indexBody, ["intelligenceIndex", "models"], findModelArray) as [
    Record<string, unknown>[],
    Record<string, unknown>[],
  ];

  const enrichFailures = [modelsPageModels, omniscienceEnrich].filter((a) => a.length === 0).length;
  const [primary, secondary] = indexModels.length > 0 ? [indexModels, catalog] : [catalog, indexModels];
  const merged = mergeBySlug(primary, secondary, modelsPageModels, omniscienceEnrich)
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const weights = buildWeightsRecord(merged);
  const models = merged.sort(byNumberDesc((m) => m.intelligence_index));
  if (models.length === 0) {
    throw zeroUpstream(
      "Artificial Analysis parsing",
      "models",
      `catalog=${catalog.length}, kept=0, enrichFailures=${enrichFailures}`,
    );
  }
  const backfilled = backfillFromMeta(models, openRouterMeta);
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  return { models, weights, enrichFailed: enrichFailures > 0 };
}

export const getIntelligenceIndexResult = (ctx: AppContext): Promise<IntelligenceIndexResult> =>
  cachedSource(ctx, cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    const { models, weights, enrichFailed } = await fetchIntelligenceIndex(ctx);
    return {
      value: { models, weights, enrichFailed, fetchedAt: new Date().toISOString() },
      ttl: ttlFor(enrichFailed),
    };
  });

export const getIntelligenceIndex = async (ctx: AppContext): Promise<SourcePayload<ArtificialAnalysisModel[]>> => {
  const { models, enrichFailed, fetchedAt } = await getIntelligenceIndexResult(ctx);
  return { data: models, fetchedAt, ...(enrichFailed ? { partial: true } : {}) };
};

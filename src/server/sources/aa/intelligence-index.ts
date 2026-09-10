import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { parseRscPayloads, findNextData } from "@/server/parsers/rsc";
import { zeroUpstream } from "@/server/infra/errors";
import { byNumberDesc } from "@/server/parsers/shaping";
import { isValidModelIdentity } from "@/server/parsers/data-filter";
import { getModelDirectory } from "@/server/sources/openrouter/directory";
import { compact, compactOmniscienceEnrich } from "@/server/parsers/aa-catalog";
import { backfillFromMeta } from "@/server/parsers/aa-match-meta";
import { fetchAaRsc, fetchAndParseEnrich } from "@/server/sources/aa/fetch";
import { upstreamEndpoints } from "@/server/config";
import { buildWeightsRecord, findModelArray, mergeBySlug } from "@/server/parsers/aa-index";
import type { IntelligenceIndexResult } from "@/server/parsers/aa-index";

async function fetchIntelligenceIndex(ctx: AppContext): Promise<IntelligenceIndexResult> {
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
      .catch(() => ({}) as Record<string, import("@/server/parsers/or-types").ModelMetaEntry>),
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
  // Served in full: detail pages, search and the weights lookup resolve
  // against this list, so truncating it would lose content.
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
  ctx.cache.withTtl(cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    const { models, weights, enrichFailed } = await fetchIntelligenceIndex(ctx);
    return { data: { models, weights, enrichFailed }, ttl: ttlFor(enrichFailed) };
  });

export const getIntelligenceIndex = async (
  ctx: AppContext,
): Promise<import("@/server/sources/types").SourcePayload<ArtificialAnalysisModel[]>> => {
  const { models, enrichFailed } = await getIntelligenceIndexResult(ctx);
  return { data: models, fetchedAt: new Date().toISOString(), ...(enrichFailed ? { partial: true } : {}) };
};

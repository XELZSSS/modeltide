import { byNumberDesc, isValidModelIdentity } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { parseRscPayload, findNextData } from "@/server/parsers/rsc-parser";

import { getModelDirectory } from "@/server/sources/openrouter-directory";
import { compact } from "@/server/parsers/aa/model-compact";
import {
  backfillFromMeta,
  compactOmniscienceEnrich,
  findModelArray,
  mergeBySlug,
  type IntelligenceIndexResult,
} from "@/server/parsers/aa/model-enrich";
import { fetchAaRsc, getAndParseEnrich } from "@/server/sources/aa/aa-fetch";
import type { SourcePayload } from "@/shared/types";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";
import { upstreamEndpoints } from "@/server/config";
import { cachedPayload, cachedRaw, requireParsed, requireRows } from "@/server/sources/pipeline";

export function getAaIndexBody(ctx: AppContext): Promise<string> {
  return cachedRaw(ctx, cacheKeys.aaIndexBody, DEFAULT_TTL_MS, () => fetchAaRsc(ctx, upstreamEndpoints.aaIndex));
}

async function fetchIntelligenceIndex(ctx: AppContext): Promise<Omit<IntelligenceIndexResult, "fetchedAt">> {
  const [indexBody, [modelsEnrich, omniscienceEnrich], openRouterMeta] = await Promise.all([
    getAaIndexBody(ctx),
    Promise.all([
      getAndParseEnrich<Record<string, unknown>>(ctx, cacheKeys.aaModelsEnrich, {
        label: "/models",
        path: upstreamEndpoints.aaModels,
        marker: "initialModels",
        extract: (tree) => findNextData(tree, "initialModels"),
      }),
      getAndParseEnrich<Record<string, unknown>>(ctx, cacheKeys.aaOmniscienceEnrich, {
        label: "/omniscience",
        path: upstreamEndpoints.aaOmniscience,
        marker: "initialModels",
        extract: (tree) => findNextData(tree, "initialModels"),
        // Drop here, not in the extractor: an empty leg must stay successful, not partial.
        map: (arr) =>
          arr.map(compactOmniscienceEnrich).filter((m) => m.omniscience != null || m.omniscienceBreakdown != null),
      }),
    ]),
    getModelDirectory(ctx)
      .then((d) => d.meta)
      .catch(() => ({}) as Record<string, ModelMetaEntry>),
  ]);

  // The marker only selects the line to parse: one marker is all the page must carry.
  const indexModels = requireParsed(parseRscPayload(indexBody, "intelligenceIndex", findModelArray));

  const enrichFailures = [modelsEnrich, omniscienceEnrich].filter((leg) => leg.failed).length;
  const merged = mergeBySlug(indexModels, modelsEnrich.rows, omniscienceEnrich.rows)
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const models = merged.sort(byNumberDesc((m) => m.intelligence_index));
  requireRows(
    models,
    "Artificial Analysis parsing",
    "models",
    `raw=${indexModels.length}, kept=0, enrichFailures=${enrichFailures}`,
  );
  const backfilled = backfillFromMeta(models, openRouterMeta);
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  return { models, enrichFailed: enrichFailures > 0 };
}

export const getIntelligenceIndex = (ctx: AppContext): Promise<SourcePayload<ArtificialAnalysisModel[]>> =>
  cachedPayload<ArtificialAnalysisModel[]>(ctx, cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    const { models, enrichFailed } = await fetchIntelligenceIndex(ctx);
    return { rows: models, partial: enrichFailed };
  });

export const getIntelligenceIndexResult = async (ctx: AppContext): Promise<IntelligenceIndexResult> => {
  const { data, fetchedAt, partial } = await getIntelligenceIndex(ctx);
  return { models: data, enrichFailed: partial === true, fetchedAt };
};

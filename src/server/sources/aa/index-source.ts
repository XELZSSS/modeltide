import { byNumberDesc, isValidModelIdentity } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { BENCHMARK_KEYS, DEFAULT_TTL_MS, MODALITY_KEYS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import { SOURCE_LIMITS } from "@/server/config/limits";
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
  return cachedRaw(ctx, cacheKeys.aaIndexBody, DEFAULT_TTL_MS, (ctx) => fetchAaRsc(ctx, upstreamEndpoints.aaIndex));
}

const BENCHMARK_WIRE_NAMES = [
  "mmluPro",
  "tauBanking",
  "terminalBench21",
  "terminalbenchHard",
  "terminalBench40",
  "apexAgents",
  "mmmuPro",
  "automationBenchPartialScore",
];

const MODALITY_WIRE_NAMES = MODALITY_KEYS.flatMap((mo) => {
  const suffix = mo.charAt(0).toUpperCase() + mo.slice(1);
  return [`inputModality${suffix}`, `outputModality${suffix}`];
});

const MODELS_ENRICH_FIELDS = [
  "id",
  "slug",
  "name",
  "shortName",
  "intelligenceIndex",
  "isReasoning",
  "analystAgent",
  "releaseDate",
  "isOpenWeights",
  "parameters",
  "sizeClass",
  "price1mInputTokens",
  "price1mOutputTokens",
  "cacheHitPrice",
  "cacheWritePrice",
  "medianCanonicalAnswerOutputSpeed",
  "omniscienceBreakdown",
  "creator",
  ...BENCHMARK_KEYS,
  ...BENCHMARK_WIRE_NAMES,
  ...MODALITY_WIRE_NAMES,
];

function compactModelsEnrich(m: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of MODELS_ENRICH_FIELDS) {
    if (field in m) row[field] = m[field];
  }
  return row;
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
        map: (arr) => arr.map(compactModelsEnrich),
      }),
      getAndParseEnrich<Record<string, unknown>>(ctx, cacheKeys.aaOmniscienceEnrich, {
        label: "/omniscience",
        path: upstreamEndpoints.aaOmniscience,
        marker: "initialModels",
        extract: (tree) => findNextData(tree, "initialModels"),
        map: (arr) =>
          arr.map(compactOmniscienceEnrich).filter((m) => m.omniscience != null || m.omniscienceBreakdown != null),
      }),
    ]),
    getModelDirectory(ctx)
      .then((d) => d.meta)
      .catch((): Record<string, ModelMetaEntry> | null => null),
  ]);

  const indexModels = requireParsed(parseRscPayload(indexBody, "intelligenceIndex", findModelArray));

  const enrichFailures =
    [modelsEnrich, omniscienceEnrich].filter((leg) => leg.failed).length + (openRouterMeta === null ? 1 : 0);
  const merged = mergeBySlug(indexModels, modelsEnrich.rows, omniscienceEnrich.rows)
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const ranked = merged.sort(byNumberDesc((m) => m.intelligence_index));
  const models = ranked.slice(0, SOURCE_LIMITS.aaIndexModels);
  if (models.length < ranked.length) {
    ctx.log("warn", `[artificial] index capped at ${models.length}/${ranked.length} models`);
  }
  requireRows(
    models,
    "Artificial Analysis parsing",
    "models",
    `raw=${indexModels.length}, kept=0, enrichFailures=${enrichFailures}`,
  );
  const backfilled = backfillFromMeta(models, openRouterMeta ?? {});
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  return { models, enrichFailed: enrichFailures > 0 };
}

export const getIntelligenceIndex = (ctx: AppContext): Promise<SourcePayload<ArtificialAnalysisModel[]>> =>
  cachedPayload<ArtificialAnalysisModel[]>(ctx, cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async (ctx) => {
    const { models, enrichFailed } = await fetchIntelligenceIndex(ctx);
    return { rows: models, partial: enrichFailed };
  });

export const getIntelligenceIndexResult = async (ctx: AppContext): Promise<IntelligenceIndexResult> => {
  const { data, fetchedAt, partial } = await getIntelligenceIndex(ctx);
  return { models: data, enrichFailed: partial === true, fetchedAt };
};

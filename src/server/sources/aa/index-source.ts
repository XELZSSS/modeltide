import { byNumberDesc, isValidModelIdentity } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { BENCHMARK_KEYS, DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import { SOURCE_LIMITS } from "@/server/config/limits";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { findNextData } from "@/server/parsers/rsc-parser";

import { getModelDirectoryMeta } from "@/server/sources/openrouter-directory";
import { benchmarkWireNames, compact, modalityWireNames } from "@/server/parsers/aa/model-compact";
import { parseLeaderboardModels } from "@/server/parsers/aa/leaderboard-parser";
import { backfillFromMeta, mergeBySlug, type IntelligenceIndexResult } from "@/server/parsers/aa/model-enrich";
import { fetchAaRsc, getAndParseEnrich } from "./aa-fetch";
import type { SourcePayload } from "@/shared/types";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";
import { upstreamEndpoints } from "@/server/config";
import type { CacheResult } from "@/server/infra/cache/service";
import { errMsg } from "@/server/infra/errors";
import { cachedPayload, cachedRaw, requireParsed, requireRows } from "@/server/sources/pipeline";

export function getAaLeaderboardBody(ctx: AppContext): Promise<CacheResult<string>> {
  return cachedRaw(ctx, cacheKeys.aaLeaderboardBody, DEFAULT_TTL_MS, (ctx) =>
    fetchAaRsc(ctx, upstreamEndpoints.aaLeaderboard),
  );
}

const MODELS_ENRICH_BASE_FIELDS = [
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
  "creator",
  ...BENCHMARK_KEYS,
  ...benchmarkWireNames,
  ...modalityWireNames,
];

// Live RSC shapes (verified 2026-10): /models carries
// omniscienceHallucinationRate but not medianCanonicalAnswerOutputSpeed /
// omniscienceBreakdown / itbenchSre; /evaluations/omniscience is the reverse
// (itbenchSre is covered there and on the leaderboard body).
const MODELS_PATH_FIELDS = [
  ...MODELS_ENRICH_BASE_FIELDS.filter((f) => f !== "itbenchSre"),
  "omniscienceHallucinationRate",
];

const OMNISCIENCE_PATH_FIELDS = [
  ...MODELS_ENRICH_BASE_FIELDS,
  "medianCanonicalAnswerOutputSpeed",
  "omniscienceBreakdown",
];

function compactWithFields(fields: readonly string[]) {
  return (m: Record<string, unknown>): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in m) row[field] = m[field];
    }
    return row;
  };
}

async function fetchIntelligenceIndex(
  ctx: AppContext,
): Promise<{ models: ArtificialAnalysisModel[]; partial: boolean }> {
  const enrichLeg = (cacheKey: string, label: string, path: string, fields: readonly string[]) =>
    getAndParseEnrich<Record<string, unknown>>(ctx, cacheKey, {
      label,
      path,
      marker: "initialModels",
      extract: (tree) => findNextData(tree, "initialModels"),
      map: (arr) => arr.map(compactWithFields(fields)),
    });
  const [indexBody, [modelsEnrich, omniscienceEnrich], openRouterMeta] = await Promise.all([
    getAaLeaderboardBody(ctx),
    Promise.all([
      enrichLeg(cacheKeys.aaModelsEnrich, "/models", upstreamEndpoints.aaModels, MODELS_PATH_FIELDS),
      enrichLeg(
        cacheKeys.aaOmniscienceEnrich,
        "/omniscience",
        upstreamEndpoints.aaOmniscience,
        OMNISCIENCE_PATH_FIELDS,
      ),
    ]),
    getModelDirectoryMeta(ctx).catch((err: unknown): Record<string, ModelMetaEntry> | null => {
      ctx.log("warn", `[artificial] OpenRouter directory metadata leg failed: ${errMsg(err)}`);
      return null;
    }),
  ]);

  const indexModels = requireParsed(parseLeaderboardModels(indexBody.value), ctx.log, "aa-leaderboard");

  const enrichFailures =
    [modelsEnrich, omniscienceEnrich].filter((leg) => leg.failed).length + (openRouterMeta === null ? 1 : 0);
  const merged = mergeBySlug(indexModels, modelsEnrich.rows, omniscienceEnrich.rows)
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const ranked = merged.sort(byNumberDesc((m) => m.intelligence_index));
  const models = ranked.slice(0, SOURCE_LIMITS.aaIndexModels);
  const capped = models.length < ranked.length;
  if (capped) {
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
  return { models, partial: enrichFailures > 0 || capped || indexBody.degraded };
}

export const getIntelligenceIndex = (ctx: AppContext): Promise<SourcePayload<ArtificialAnalysisModel[]>> =>
  cachedPayload<ArtificialAnalysisModel[]>(ctx, cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async (ctx) => {
    const { models, partial } = await fetchIntelligenceIndex(ctx);
    return { rows: models, partial };
  });

export const getIntelligenceIndexResult = async (ctx: AppContext): Promise<IntelligenceIndexResult> => {
  const { data, fetchedAt, partial } = await getIntelligenceIndex(ctx);
  return { models: data, enrichFailed: partial, fetchedAt };
};

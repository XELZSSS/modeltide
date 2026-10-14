import { byNumberDesc, isValidModelIdentity } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { BENCHMARK_KEYS, DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { findNextData } from "@/server/parsers/rsc-parser";

import { getModelDirectoryMeta } from "@/server/sources/openrouter-directory";
import { benchmarkWireNames, compact, modalityWireNames } from "@/server/parsers/aa/model-compact";
import { parseLeaderboardModels } from "@/server/parsers/aa/leaderboard-parser";
import { backfillFromMeta, mergeBySlug, type IntelligenceIndexResult } from "@/server/parsers/aa/model-enrich";
import { fetchAaRsc, getAndParseEnrich } from "./aa-fetch";
import type { SourcePayload } from "@/shared/types";
import { upstreamEndpoints } from "@/server/config";
import type { CacheResult } from "@/server/infra/cache/service";
import { errMsg, UpstreamError } from "@/server/infra/errors";
import { cachedPayload, cachedRaw, requireParsed, requireRows } from "@/server/sources/pipeline";
import { runLegs } from "@/server/sources/join-legs";

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

// Live RSC shapes (verified 2026-10): /models carries omniscienceHallucinationRate
// and itBenchSre (camelCase; the same values the leaderboard already reports, so the
// field is excluded below) but neither medianCanonicalAnswerOutputSpeed nor
// omniscienceBreakdown; /evaluations/omniscience is the reverse and also carries
// itbenchSre (lowercase). The leaderboard body carries both spellings' worth of data
// through its mapped rows.
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
  const { values, failures } = await runLegs(
    [
      { label: "leaderboard", run: () => getAaLeaderboardBody(ctx) },
      {
        label: "models-enrich",
        run: () => enrichLeg(cacheKeys.aaModelsEnrich, "/models", upstreamEndpoints.aaModels, MODELS_PATH_FIELDS),
      },
      {
        label: "omniscience-enrich",
        run: () =>
          enrichLeg(
            cacheKeys.aaOmniscienceEnrich,
            "/omniscience",
            upstreamEndpoints.aaOmniscience,
            OMNISCIENCE_PATH_FIELDS,
          ),
      },
      {
        label: "directory-meta",
        run: () =>
          getModelDirectoryMeta(ctx).catch((err: unknown) => {
            ctx.log("warn", `[artificial] OpenRouter directory metadata leg failed: ${errMsg(err)}`);
            return { meta: {}, partial: true as const, failed: true as const };
          }),
      },
    ] as const,
    {
      onFailure: (f) => ctx.log("warn", `[artificial] ${f.label} leg failed: ${errMsg(f.reason)}`),
    },
  );
  const [indexBody, modelsEnrich, omniscienceEnrich, directoryMeta] = values;
  const leaderboardFailure = failures.find((f) => f.label === "leaderboard");
  if (leaderboardFailure || indexBody == null) {
    throw new UpstreamError("Artificial Analysis: leaderboard fetch failed", { retryable: true });
  }
  const openRouterMeta = directoryMeta == null ? null : directoryMeta.meta;
  const directoryPartial =
    directoryMeta == null ||
    ("failed" in directoryMeta && directoryMeta.failed) ||
    ("partial" in directoryMeta && directoryMeta.partial === true);

  const indexModels = requireParsed(parseLeaderboardModels(indexBody.value), ctx.log, "aa-leaderboard");

  const enrichFailures =
    [modelsEnrich, omniscienceEnrich].filter((leg) => leg?.failed).length + (openRouterMeta === null ? 1 : 0);
  const merged = mergeBySlug(
    indexModels,
    (modelsEnrich?.rows ?? []) as Record<string, unknown>[],
    (omniscienceEnrich?.rows ?? []) as Record<string, unknown>[],
  )
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const ranked = merged.sort(byNumberDesc((m) => m.intelligence_index));
  const models = ranked;
  requireRows(
    models,
    "Artificial Analysis parsing",
    "models",
    `raw=${indexModels.length}, kept=0, enrichFailures=${enrichFailures}`,
  );
  const backfilled = backfillFromMeta(models, openRouterMeta ?? {});
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  return { models, partial: enrichFailures > 0 || indexBody.degraded || directoryPartial };
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

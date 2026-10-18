import { byNumberDesc, isValidModelIdentity } from "@/server/formats/parser-primitives";
import type { AppContext } from "@/server/api/context";
import { BENCHMARK_KEYS, DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { findNextData } from "@/server/formats/rsc-parser";

import { getModelDirectoryMeta } from "@/server/openrouter/directory";
import { benchmarkWireNames, compact, modalityWireNames } from "./parse/model-compact";
import { parseLeaderboardModels } from "./parse/leaderboard";
import { backfillFromMeta, mergeBySlug, type IntelligenceIndexResult } from "./parse/model-enrich";
import { fetchAaRsc, getAndParseEnrich } from "./fetch";
import type { SourcePayload } from "@/shared/types";
import { upstreamEndpoints } from "@/server/upstream/upstream";
import type { CacheResult } from "@/server/cache/service";
import { errMsg, UpstreamError } from "@/server/api/errors";
import { cachedPayload, cachedRaw, requireParsed, requireRows } from "@/server/pipeline";
import { runLegs } from "@/server/join-legs";

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

// Per-path allow-lists of what each RSC path returns; /omniscience serves raw Elo `gdpval`, not normalized.
const MODELS_PATH_ABSENT = ["briefcaseElo", "cweBench", "cyberIndex", "deepsecBench", "itBenchSre"] as const;

const MODELS_PATH_FIELDS = [
  ...MODELS_ENRICH_BASE_FIELDS.filter((f) => f !== "itbenchSre"),
  "omniscienceHallucinationRate",
];

const OMNISCIENCE_PATH_ABSENT = ["gdpvalNormalized", "itbenchSre"] as const;

const OMNISCIENCE_PATH_FIELDS = [
  ...MODELS_ENRICH_BASE_FIELDS.filter((f) => f !== "gdpvalNormalized"),
  "medianCanonicalAnswerOutputSpeed",
  "omniscienceBreakdown",
];

function projectFields(fields: readonly string[]): (m: Record<string, unknown>) => Record<string, unknown> {
  return (m) => {
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
  const enrichLeg = (
    cacheKey: string,
    label: string,
    path: string,
    fields: readonly string[],
    absent: readonly string[] = [],
  ) => {
    const project = projectFields(fields);
    return getAndParseEnrich<Record<string, unknown>>(ctx, cacheKey, {
      label,
      path,
      marker: "initialModels",
      extract: (tree) => findNextData(tree, "initialModels"),
      fields,
      absent,
      map: (arr) => arr.map(project),
    });
  };
  const { values, failures } = await runLegs(
    [
      { label: "leaderboard", run: () => getAaLeaderboardBody(ctx) },
      {
        label: "models-enrich",
        run: () =>
          enrichLeg(
            cacheKeys.aaModelsEnrich,
            "/models",
            upstreamEndpoints.aaModels,
            MODELS_PATH_FIELDS,
            MODELS_PATH_ABSENT,
          ),
      },
      {
        label: "omniscience-enrich",
        run: () =>
          enrichLeg(
            cacheKeys.aaOmniscienceEnrich,
            "/omniscience",
            upstreamEndpoints.aaOmniscience,
            OMNISCIENCE_PATH_FIELDS,
            OMNISCIENCE_PATH_ABSENT,
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
  // Backfill before ranking: an -Infinity sort key would keep that slot once filled.
  const backfilled = backfillFromMeta(merged, openRouterMeta ?? {});
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  const models = merged.sort(byNumberDesc((m) => m.intelligence_index));
  requireRows(
    models,
    "Artificial Analysis parsing",
    "models",
    `raw=${indexModels.length}, kept=0, enrichFailures=${enrichFailures}`,
  );
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

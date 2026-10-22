import { byNumberDesc, isValidModelIdentity } from "@/server/formats/parser-primitives";
import type { AppContext } from "@/server/api/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { findNextData } from "@/server/formats/rsc-parser";

import { getModelDirectoryMeta } from "@/server/openrouter/directory";
import {
  compact,
  modalityWireNames,
  modelsBenchmarkWireNames,
  omniscienceBenchmarkWireNames,
  omniscienceModalityWireNames,
  presentAlias,
} from "./parse/model-compact";
import { parseLeaderboardModels } from "./parse/leaderboard";
import { backfillFromMeta, mergeBySlug, type IntelligenceIndexResult } from "./parse/model-enrich";
import { fetchAaRsc, getAndParseEnrich } from "./fetch";
import { upstreamEndpoints } from "@/server/upstream/upstream";
import type { CacheResult } from "@/server/cache/service";
import { errMsg, UpstreamError } from "@/server/api/errors";
import { cachedRaw, defineSource, requireParsed, requireRows } from "@/server/pipeline";
import { fanOut } from "@/server/fan-out";

export function getAaLeaderboardBody(ctx: AppContext): Promise<CacheResult<string>> {
  return cachedRaw(ctx, cacheKeys.aaLeaderboardBody, DEFAULT_TTL_MS, (ctx) =>
    fetchAaRsc(ctx, upstreamEndpoints.aaLeaderboard),
  );
}

const ENRICH_BASE_FIELDS = [
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
];

const MODELS_PATH_FIELDS = [
  ...ENRICH_BASE_FIELDS,
  "omniscienceHallucinationRate",
  ...modelsBenchmarkWireNames,
  ...modalityWireNames,
];

const OMNISCIENCE_PATH_FIELDS = [
  ...ENRICH_BASE_FIELDS,
  "medianCanonicalAnswerOutputSpeed",
  "omniscienceBreakdown",
  ...omniscienceBenchmarkWireNames,
  ...omniscienceModalityWireNames,
];

function projectFields(fields: readonly string[]): (m: Record<string, unknown>) => Record<string, unknown> {
  return (m) => {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      const alias = presentAlias(m, field);
      if (alias !== undefined) row[field] = m[alias];
    }
    return row;
  };
}

async function fetchIntelligenceIndex(
  ctx: AppContext,
): Promise<{ models: ArtificialAnalysisModel[]; partial: boolean }> {
  const enrichLeg = (cacheKey: string, label: string, path: string, fields: readonly string[]) => {
    const project = projectFields(fields);
    return getAndParseEnrich<Record<string, unknown>>(ctx, cacheKey, {
      label,
      path,
      marker: "initialModels",
      extract: (tree) => findNextData(tree, "initialModels"),
      fields,
      map: (arr) => arr.map(project),
    });
  };
  const { values, failures } = await fanOut(
    ctx,
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
    { tag: "artificial" },
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
  // Declared-ratio fields that arrive on another scale are dropped by `compact`; surface them instead of losing data
  // silently (the parse is cached, so this logs at most once per refresh).
  const outOfRatio = new Set<string>();
  const warnRatio = (field: string, value: number): void => {
    if (outOfRatio.size < 8) outOfRatio.add(`${field}=${value}`);
  };
  const merged = mergeBySlug(
    indexModels,
    (modelsEnrich?.rows ?? []) as Record<string, unknown>[],
    (omniscienceEnrich?.rows ?? []) as Record<string, unknown>[],
  )
    .map((row) => compact(row, warnRatio))
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  if (outOfRatio.size > 0) {
    ctx.log("warn", `[artificial] dropped out-of-range ratio field(s): ${[...outOfRatio].join(", ")}`);
  }
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

export const getIntelligenceIndex = defineSource<
  { models: ArtificialAnalysisModel[]; partial: boolean },
  ArtificialAnalysisModel
>({
  key: cacheKeys.intelligenceIndex,
  ttl: DEFAULT_TTL_MS,
  label: "Artificial Analysis parsing",
  fetch: (ctx) => fetchIntelligenceIndex(ctx),
  parse: (raw) => raw.models,
  partialWhen: ({ raw }) => ({ partial: raw.partial }),
});

export const getIntelligenceIndexResult = async (ctx: AppContext): Promise<IntelligenceIndexResult> => {
  const { data, fetchedAt, partial } = await getIntelligenceIndex(ctx);
  return { models: data, enrichFailed: partial, fetchedAt };
};

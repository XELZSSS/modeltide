import type { AppContext } from "@/server/api/context";
import { ONE_HOUR } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { findNextData } from "@/server/formats/rsc-data";

import { getModelDirectory } from "@/server/openrouter/directory";
import { parseLeaderboardModels } from "./parse/leaderboard";
import { MODELS_PATH_FIELDS, OMNISCIENCE_PATH_FIELDS, projectFields } from "./parse/enrich-fields";
import { assembleModels } from "./parse/assemble";
import { defineEnrichSource, fetchAaRsc } from "./fetch";
import { upstreamEndpoints } from "@/server/upstream/upstream";
import { UpstreamError } from "@/server/api/errors";
import { defineSource, requireParsed, requireRows } from "@/server/pipeline";
import { fanOut } from "@/server/fan-out";
import { MAX_LEADERBOARD_ROWS } from "@/server/formats/limits";

const leaderboardBodySource = defineSource<string, string>({
  key: cacheKeys.aaLeaderboardBody,
  ttl: ONE_HOUR,
  label: "AA leaderboard body",
  fetch: (ctx) => fetchAaRsc(ctx, upstreamEndpoints.aaLeaderboard),
  parse: (body) => body,
});

export const getAaLeaderboardBody = leaderboardBodySource;

const modelsEnrichSource = defineEnrichSource<Record<string, unknown>>({
  key: cacheKeys.aaModelsEnrich,
  label: "/models",
  path: upstreamEndpoints.aaModels,
  marker: "initialModels",
  extract: (tree) => findNextData(tree, "initialModels"),
  fields: MODELS_PATH_FIELDS,
  map: (arr) => arr.map(projectFields(MODELS_PATH_FIELDS)),
});

const omniscienceEnrichSource = defineEnrichSource<Record<string, unknown>>({
  key: cacheKeys.aaOmniscienceEnrich,
  label: "/omniscience",
  path: upstreamEndpoints.aaOmniscience,
  marker: "initialModels",
  extract: (tree) => findNextData(tree, "initialModels"),
  fields: OMNISCIENCE_PATH_FIELDS,
  map: (arr) => arr.map(projectFields(OMNISCIENCE_PATH_FIELDS)),
});

async function fetchIntelligenceIndex(
  ctx: AppContext,
): Promise<{ models: ArtificialAnalysisModel[]; partial: boolean }> {
  const { values } = await fanOut(
    ctx,
    [
      { label: "leaderboard", run: () => leaderboardBodySource(ctx) },
      { label: "models-enrich", run: () => modelsEnrichSource(ctx) },
      { label: "omniscience-enrich", run: () => omniscienceEnrichSource(ctx) },
      { label: "directory-meta", run: () => getModelDirectory(ctx) },
    ] as const,
    { tag: "artificial" },
  );
  const [indexBody, modelsEnrich, omniscienceEnrich, directory] = values;
  if (indexBody == null) {
    throw new UpstreamError("Artificial Analysis: leaderboard fetch failed", { retryable: true });
  }
  const openRouterMeta = directory?.data.meta ?? null;
  const directoryPartial = directory == null || directory.partial;

  const indexModels = requireParsed(parseLeaderboardModels(indexBody.data), ctx.log, "aa-leaderboard");

  // Only the two enrichment legs. The directory is a separate source whose failure is already carried by
  // `directoryPartial`, so counting it here too inflated the number the suite log below reports.
  const enrichFailures = [modelsEnrich, omniscienceEnrich].filter((leg) => leg == null || leg.partial).length;
  const { models, outOfRatio, backfilled } = assembleModels({
    indexModels,
    modelsEnrich: modelsEnrich?.data ?? [],
    omniscienceEnrich: omniscienceEnrich?.data ?? [],
    meta: openRouterMeta,
  });
  if (outOfRatio.length > 0) {
    ctx.log("warn", `[artificial] dropped out-of-range ratio field(s): ${outOfRatio.join(", ")}`);
  }
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  requireRows(
    models,
    "Artificial Analysis parsing",
    "models",
    `raw=${indexModels.length}, kept=0, enrichFailures=${enrichFailures}`,
  );
  return { models, partial: enrichFailures > 0 || indexBody.partial || directoryPartial };
}

/**
 * How long the index payload may stay cached at the origin. `src/server/registry.ts` reads this same constant for the
 * route's HTTP cache headers, so the edge window cannot drift from the origin window.
 */
export const ARTIFICIAL_INDEX_TTL_MS = ONE_HOUR;
export const getIntelligenceIndex = defineSource<
  { models: ArtificialAnalysisModel[]; partial: boolean },
  ArtificialAnalysisModel[]
>({
  key: cacheKeys.intelligenceIndex,
  ttl: ARTIFICIAL_INDEX_TTL_MS,
  label: "Artificial Analysis parsing",
  served: true,
  // Same ceiling as the other leaderboards: an oversized index is truncated and reported partial instead of being
  // parsed into a payload the client cannot page through anyway.
  cap: MAX_LEADERBOARD_ROWS,
  fetch: (ctx) => fetchIntelligenceIndex(ctx),
  parse: (raw) => raw.models,
  partialWhen: ({ raw }) => ({ partial: raw.partial }),
});

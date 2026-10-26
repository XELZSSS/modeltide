import type { AppContext } from "@/server/api/context";
import { ONE_HOUR } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { getModelDirectory } from "@/server/openrouter/directory";
import { parseLeaderboardModels } from "./parse/leaderboard";
import { MODELS_PATH_FIELDS, OMNISCIENCE_PATH_FIELDS } from "./parse/enrich-fields";
import { assembleModels } from "./parse/assemble";
import { defineEnrichSource, fetchAaRsc } from "./fetch";
import { upstreamEndpoints } from "@/server/upstream/upstream";
import { UpstreamError } from "@/server/api/errors";
import { definePartialSource, defineSource, requireParsed, requireRows } from "@/server/pipeline";
import { fanOut } from "@/server/fan-out";
import { MAX_LEADERBOARD_ROWS } from "@/server/formats/limits";

export const getAaLeaderboardBody = defineSource<string, string>({
  key: cacheKeys.aaLeaderboardBody,
  ttl: ONE_HOUR,
  label: "AA leaderboard body",
  fetch: (ctx) => fetchAaRsc(ctx, upstreamEndpoints.aaLeaderboard),
  parse: (body) => body,
});

const modelsEnrichSource = defineEnrichSource({
  key: cacheKeys.aaModelsEnrich,
  label: "/models",
  path: upstreamEndpoints.aaModels,
  fields: MODELS_PATH_FIELDS,
});

const omniscienceEnrichSource = defineEnrichSource({
  key: cacheKeys.aaOmniscienceEnrich,
  label: "/omniscience",
  path: upstreamEndpoints.aaOmniscience,
  fields: OMNISCIENCE_PATH_FIELDS,
});

async function fetchIntelligenceIndex(
  ctx: AppContext,
): Promise<{ models: ArtificialAnalysisModel[]; partial: boolean }> {
  const { values } = await fanOut(
    ctx,
    [
      { label: "leaderboard", run: () => getAaLeaderboardBody(ctx) },
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
  const openRouterMeta = directory?.payload.data.meta ?? null;
  const directoryPartial = directory == null || directory.payload.partial;

  const indexModels = requireParsed(parseLeaderboardModels(indexBody.payload.data), ctx.log, "aa-leaderboard");

  // Only the two enrichment legs. The directory is a separate source whose failure is already carried by
  // `directoryPartial`, so counting it here too inflated the number the suite log below reports.
  const enrichFailures = [modelsEnrich, omniscienceEnrich].filter((leg) => leg == null || leg.payload.partial).length;
  const { models, outOfRatio, backfilled } = assembleModels({
    indexModels,
    modelsEnrich: modelsEnrich?.payload.data ?? [],
    omniscienceEnrich: omniscienceEnrich?.payload.data ?? [],
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
  return { models, partial: enrichFailures > 0 || indexBody.payload.partial || directoryPartial };
}

export const getIntelligenceIndex = definePartialSource<
  { models: ArtificialAnalysisModel[]; partial: boolean },
  ArtificialAnalysisModel[]
>({
  key: cacheKeys.intelligenceIndex,
  ttl: ONE_HOUR,
  label: "Artificial Analysis parsing",
  served: true,
  // Same ceiling as the other leaderboards: an oversized index is truncated and reported partial instead of being
  // parsed into a payload the client cannot page through anyway.
  cap: MAX_LEADERBOARD_ROWS,
  fetch: (ctx) => fetchIntelligenceIndex(ctx),
  pick: (raw) => raw.models,
});

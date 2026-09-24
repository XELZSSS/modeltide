import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/task-pool";
import { runLegs } from "@/server/sources/join-legs";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image-source";
import { getModels } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { HomeDashboardData, HomeOpenSourceEntry, OpenSourceModelEntry, SourcePayload } from "@/shared/types";
import { isPartialDashboard } from "@/shared/utils";
import { cachedPayload } from "@/server/sources/pipeline";

const HOME_OR_RANKING_ROWS = 5;
const HOME_TEXT_TO_IMAGE_ROWS = 8;

function homeOpenSourceRow({ id, downloads, task }: OpenSourceModelEntry): HomeOpenSourceEntry {
  return { id, downloads, task };
}

async function fetchHomeDashboard(ctx: AppContext): Promise<{ data: HomeDashboardData; partial: boolean }> {
  const { values, failures } = await runLegs([
    { label: "openrouter", run: () => getOpenRouterRankings(ctx) },
    { label: "textToImage", run: () => getTextToImageLeaderboard(ctx) },
    { label: "opensource", run: () => getModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }) },
  ]);
  const reasons = failures.map((f) => `${f.label}: ${errMsg(f.reason)}`).join("; ");
  const [orRankings, textToImage, opensource] = values;
  if (!orRankings && !textToImage && !opensource) {
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`, { retryable: true });
  }
  const data: HomeDashboardData = {
    orRankings: orRankings ? orRankings.data.slice(0, HOME_OR_RANKING_ROWS) : null,
    textToImage: textToImage ? textToImage.data.slice(0, HOME_TEXT_TO_IMAGE_ROWS) : null,
    opensource: opensource ? opensource.data.map(homeOpenSourceRow) : null,
  };
  const degraded = orRankings?.partial === true || textToImage?.partial === true || opensource?.partial === true;
  const partial = isPartialDashboard(data) || degraded;
  if (partial)
    ctx.log("warn", `[home] partial dashboard${reasons ? `: ${reasons}` : " (a leg returned partial data)"}`);
  return { data, partial };
}

export async function getHomeDashboard(ctx: AppContext): Promise<SourcePayload<HomeDashboardData>> {
  return cachedPayload(
    ctx,
    cacheKeys.homeDashboard,
    FIVE_MINUTES,
    async (ctx) => {
      const { data, partial } = await fetchHomeDashboard(ctx);
      return { rows: data, partial };
    },
    { memoryOnly: true },
  );
}

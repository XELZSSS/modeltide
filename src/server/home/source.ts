import type { AppContext } from "@/server/api/context";
import { errMsg, UpstreamError } from "@/server/api/errors";
import { runLegs } from "@/server/join-legs";
import { getTextToImageLeaderboard } from "@/server/aa/text-to-image";
import { getHomeOpenSourceModels } from "@/server/huggingface/source";
import { getOpenRouterRankings } from "@/server/openrouter/rankings";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type { HomeDashboardData, HomeOpenSourceEntry, OpenSourceModelEntry, SourcePayload } from "@/shared/types";
import { cachedPayload } from "@/server/pipeline";

const HOME_OR_RANKING_ROWS = 5;
const HOME_TEXT_TO_IMAGE_ROWS = 8;

function homeOpenSourceRow({ id, downloads, task }: OpenSourceModelEntry): HomeOpenSourceEntry {
  return { id, downloads, task };
}

async function fetchHomeDashboard(ctx: AppContext): Promise<{ data: HomeDashboardData; partial: boolean }> {
  const { values, failures } = await runLegs([
    { label: "openrouter", run: () => getOpenRouterRankings(ctx) },
    { label: "textToImage", run: () => getTextToImageLeaderboard(ctx) },
    { label: "opensource", run: () => getHomeOpenSourceModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }) },
  ]);
  const reasons = failures.map((f) => `${f.label}: ${errMsg(f.reason)}`).join("; ");
  const [orRankings, textToImage, opensource] = values;
  if (!orRankings && !textToImage && !opensource) {
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`, { retryable: true });
  }
  const data: HomeDashboardData = {
    orRankings: (orRankings?.data ?? []).slice(0, HOME_OR_RANKING_ROWS),
    textToImage: (textToImage?.data ?? []).slice(0, HOME_TEXT_TO_IMAGE_ROWS),
    // Full list: the doughnut aggregates task share over all rows, while the
    // trending sidebar only takes the top entries client-side.
    opensource: (opensource?.data ?? []).map(homeOpenSourceRow),
  };
  const partial =
    failures.length > 0 ||
    orRankings?.partial === true ||
    textToImage?.partial === true ||
    opensource?.partial === true;
  if (partial) {
    ctx.log("warn", `[home] partial dashboard${reasons ? `: ${reasons}` : " (a leg returned partial data)"}`);
  }
  return { data, partial };
}

export async function getHomeDashboard(ctx: AppContext): Promise<SourcePayload<HomeDashboardData>> {
  return cachedPayload(ctx, cacheKeys.homeDashboard, FIVE_MINUTES, async (ctx) => {
    const { data, partial } = await fetchHomeDashboard(ctx);
    return { rows: data, partial };
  });
}

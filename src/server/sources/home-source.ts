import type { AppContext } from "@/server/context";
import { UpstreamError, rethrowIfAllAborted } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/task-pool";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image-source";
import { getModels } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type {
  HomeDashboardData,
  HomeOpenSourceEntry,
  OpenRouterRankingsPayload,
  OpenSourceModelEntry,
  SourcePayload,
  TextToImageModel,
} from "@/shared/types";
import { isPartialDashboard } from "@/shared/utils";
import { cached } from "@/server/sources/pipeline";

/** The KPI strip reads `tokenUsageRankings[0]`; a short head still leaves room for a top-N card. */
const HOME_OR_RANKING_ROWS = 5;
/** TextToImageSection renders at most eight cards. */
const HOME_TEXT_TO_IMAGE_ROWS = 8;

interface HomeLegs {
  orRankings: OpenRouterRankingsPayload | null;
  textToImage: SourcePayload<TextToImageModel[]> | null;
  opensource: SourcePayload<OpenSourceModelEntry[]> | null;
}

function homeOpenSourceRow({ id, downloads, task }: OpenSourceModelEntry): HomeOpenSourceEntry {
  return { id, downloads, task };
}

/**
 * Each leg is read for a fraction of itself and this is the most-hit payload, so
 * rows are projected before they are cached or shipped.
 */
function trimHomeDashboard(legs: HomeLegs): HomeDashboardData {
  const { orRankings, textToImage, opensource } = legs;
  return {
    orRankings: orRankings
      ? { ...orRankings, tokenUsageRankings: orRankings.tokenUsageRankings.slice(0, HOME_OR_RANKING_ROWS) }
      : null,
    textToImage: textToImage ? { ...textToImage, data: textToImage.data.slice(0, HOME_TEXT_TO_IMAGE_ROWS) } : null,
    // Every row is kept: the task donut is a histogram over the whole list.
    opensource: opensource ? { ...opensource, data: opensource.data.map(homeOpenSourceRow) } : null,
  };
}

async function fetchHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  const [orRankingsRes, textToImageRes, opensourceRes] = await Promise.allSettled([
    getOpenRouterRankings(ctx),
    getTextToImageLeaderboard(ctx),
    getModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }),
  ]);
  const reasons = [orRankingsRes, textToImageRes, opensourceRes]
    .map((r, i) =>
      r.status === "rejected" ? `${["openrouter", "textToImage", "opensource"][i]}: ${errMsg(r.reason)}` : null,
    )
    .filter(Boolean)
    .join("; ");
  const orRankings = orRankingsRes.status === "fulfilled" ? orRankingsRes.value : null;
  const textToImage = textToImageRes.status === "fulfilled" ? textToImageRes.value : null;
  const opensource = opensourceRes.status === "fulfilled" ? opensourceRes.value : null;
  if (!orRankings && !textToImage && !opensource) {
    rethrowIfAllAborted([orRankingsRes, textToImageRes, opensourceRes]);
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  }
  const data = trimHomeDashboard({ orRankings, textToImage, opensource });
  if (isPartialDashboard(data)) ctx.log("warn", `[home] partial failure: ${reasons}`);
  return data;
}

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  // memoryOnly is deliberate: cheap join over three KV-cached legs.
  return cached(
    ctx,
    cacheKeys.homeDashboard,
    FIVE_MINUTES,
    async () => {
      const data = await fetchHomeDashboard(ctx);
      return { data, ttl: ttlFor(isPartialDashboard(data), FIVE_MINUTES) };
    },
    { memoryOnly: true },
  );
}

import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/task-pool";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image-source";
import { getModels } from "@/server/sources/hf-source";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { HomeDashboardData } from "@/shared/types";
import { isPartialDashboard } from "@/shared/utils";
import { cachedSource } from "@/server/sources/pipeline";

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
  const data = { orRankings, textToImage, opensource };
  if (!orRankings && !textToImage && !opensource)
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  if (isPartialDashboard(data)) ctx.log("warn", `[home] partial failure: ${reasons}`);
  return data;
}

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  // memoryOnly is deliberate: cheap join over three KV-cached legs.
  return cachedSource(
    ctx,
    cacheKeys.homeDashboard,
    FIVE_MINUTES,
    async () => {
      const data = await fetchHomeDashboard(ctx);
      return { value: data, ttl: ttlFor(isPartialDashboard(data), FIVE_MINUTES) };
    },
    { memoryOnly: true },
  );
}

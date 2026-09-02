import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { settled, formatSettleErrors } from "@/server/infra/utils";
import { getTextToImageLeaderboard } from "@/server/sources/artificial-analysis";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import type { HomeDashboardData } from "@/shared/types";

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  const [orRankingsRes, textToImageRes, opensourceRes] = await Promise.allSettled([
    getOpenRouterRankings(ctx),
    getTextToImageLeaderboard(ctx),
    getModels(ctx, { sort: "downloads", direction: "-1", limit: 50 }),
  ]);
  const orRankings = settled(orRankingsRes, null);
  const textToImage = settled(textToImageRes, null);
  const opensource = settled(opensourceRes, null);
  if (!orRankings && !textToImage && !opensource) {
    const reasons = formatSettleErrors([orRankingsRes, textToImageRes, opensourceRes], ["openrouter", "textToImage", "opensource"]);
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  }
  return { orRankings, textToImage, opensource };
}

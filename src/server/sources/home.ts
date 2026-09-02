import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
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
  const orRankings = orRankingsRes.status === "fulfilled" ? orRankingsRes.value : null;
  const textToImage = textToImageRes.status === "fulfilled" ? textToImageRes.value : null;
  const opensource = opensourceRes.status === "fulfilled" ? opensourceRes.value : null;
  if (!orRankings && !textToImage && !opensource) {
    const reasons = [orRankingsRes, textToImageRes, opensourceRes]
      .filter((r) => r.status === "rejected")
      .map((r) => String((r as PromiseRejectedResult).reason))
      .join("; ");
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  }
  return { orRankings, textToImage, opensource };
}

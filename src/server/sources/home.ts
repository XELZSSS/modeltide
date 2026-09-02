import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { settled, formatSettleErrors } from "@/server/infra/utils";
import { getTextToImageLeaderboard } from "@/server/sources/artificial-analysis";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { DEFAULT_TTL_MS, PARTIAL_FAIL_TTL_MS, cacheKeys } from "@/shared/config";
import type { HomeDashboardData } from "@/shared/types";

const HOME_KEY = cacheKeys.homeDashboard;

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  return ctx.cache.withTtl(HOME_KEY, DEFAULT_TTL_MS, async () => {
    const [orRankingsRes, textToImageRes, opensourceRes] = await Promise.allSettled([
      getOpenRouterRankings(ctx),
      getTextToImageLeaderboard(ctx),
      getModels(ctx, { sort: "downloads", direction: "-1", limit: 50 }),
    ]);
    const orRankings = settled(orRankingsRes, null);
    const textToImage = settled(textToImageRes, null);
    const opensource = settled(opensourceRes, null);
    if (!orRankings && !textToImage && !opensource) {
      const reasons = formatSettleErrors(
        [orRankingsRes, textToImageRes, opensourceRes],
        ["openrouter", "textToImage", "opensource"],
      );
      throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
    }
    // Partial degradation shortens TTL so the next tick retries sooner.
    const partial = !orRankings || !textToImage || !opensource;
    return { data: { orRankings, textToImage, opensource }, ttl: partial ? PARTIAL_FAIL_TTL_MS : DEFAULT_TTL_MS };
  });
}

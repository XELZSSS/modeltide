import type { AppContext } from "@/server/context";
import { UpstreamError, settled, formatSettleErrors } from "@/server/infra";
import { getTextToImageLeaderboard } from "@/server/sources/artificial-analysis";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { PARTIAL_FAIL_TTL_MS, cacheKeys } from "@/shared/config";
import type { HomeDashboardData } from "@/shared/types";
import { isEmptyT2i } from "@/shared/types";

const HOME_KEY = cacheKeys.homeDashboard;

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  // Short outer TTL: inner sources already cache (30m/2h). A long outer TTL
  // would re-cache stale inner data and extend its lifetime indefinitely.
  const OUTER_TTL_MS = 5 * 60_000;
  return ctx.cache.withTtl(HOME_KEY, OUTER_TTL_MS, async () => {
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
    if (orRankingsRes.status === "rejected" || opensourceRes.status === "rejected") {
      ctx.log(
        "warn",
        `[home] partial failure: ${formatSettleErrors(
          [orRankingsRes, textToImageRes, opensourceRes],
          ["openrouter", "textToImage", "opensource"],
        )}`,
      );
    }
    // Partial degradation shortens TTL. Text-to-image rejects on failure (its
    // stale fallback may still serve an older empty partial), so test both
    // rejection (null) and emptiness.
    const partial = !orRankings || !opensource || isEmptyT2i(textToImage) || textToImage?.partial === true;
    return { data: { orRankings, textToImage, opensource }, ttl: partial ? PARTIAL_FAIL_TTL_MS : OUTER_TTL_MS };
  });
}

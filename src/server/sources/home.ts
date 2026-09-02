import type { AppContext } from "@/server/context";
import { UpstreamError, settled, formatSettleErrors } from "@/server/infra/errors";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { PARTIAL_FAIL_TTL_MS, THIRTY_MINUTES, cacheKeys, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import type { HomeDashboardData } from "@/shared/types";

const HOME_KEY = cacheKeys.homeDashboard;

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  return ctx.cache.withTtl(HOME_KEY, THIRTY_MINUTES, async () => {
    const [orRankingsRes, textToImageRes, opensourceRes] = await Promise.allSettled([
      getOpenRouterRankings(ctx),
      getTextToImageLeaderboard(ctx),
      getModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }),
    ]);
    const reasons = formatSettleErrors(
      [orRankingsRes, textToImageRes, opensourceRes],
      ["openrouter", "textToImage", "opensource"],
    );
    const orRankings = settled(orRankingsRes, null);
    const textToImage = settled(textToImageRes, null);
    const opensource = settled(opensourceRes, null);
    if (!orRankings && !textToImage && !opensource) {
      throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
    }
    const partial = orRankings == null || textToImage == null || opensource == null;
    if (partial) {
      ctx.log("warn", `[home] partial failure: ${reasons}`);
    }
    return {
      data: { orRankings, textToImage, opensource },
      ttl: partial ? PARTIAL_FAIL_TTL_MS : THIRTY_MINUTES,
    };
  });
}

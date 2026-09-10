import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { settled, formatSettleErrors } from "@/server/infra/pool";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { HomeDashboardData } from "@/shared/types";
import type { SourcePayload } from "@/server/sources/types";

async function fetchHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
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
  const opensource = settled(opensourceRes, null) as SourcePayload<
    import("@/shared/types").OpenSourceModelEntry[]
  > | null;
  if (!orRankings && !textToImage && !opensource)
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  const partial = orRankings == null || textToImage == null || opensource == null;
  if (partial) ctx.log("warn", `[home] partial failure: ${reasons}`);
  return { orRankings, textToImage, opensource };
}

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  return ctx.cache.withTtl(cacheKeys.homeDashboard, FIVE_MINUTES, async () => {
    const data = await fetchHomeDashboard(ctx);
    const partial = data.orRankings == null || data.textToImage == null || data.opensource == null;
    return { data, ttl: ttlFor(partial, FIVE_MINUTES) };
  });
}

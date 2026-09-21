import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/pool";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";
import { getModels } from "@/server/sources/huggingface";
import { getOpenRouterRankings } from "@/server/sources/openrouter";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { HomeDashboardData } from "@/shared/types";
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
  if (!orRankings && !textToImage && !opensource)
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`);
  const partial = orRankings == null || textToImage == null || opensource == null;
  if (partial) ctx.log("warn", `[home] partial failure: ${reasons}`);
  return { orRankings, textToImage, opensource };
}

export async function getHomeDashboard(ctx: AppContext): Promise<HomeDashboardData> {
  // memoryOnly is deliberate: cheap join over three KV-cached legs.
  return cachedSource(
    ctx,
    cacheKeys.homeDashboard,
    FIVE_MINUTES,
    async () => {
      const data = await fetchHomeDashboard(ctx);
      const partial = data.orRankings == null || data.textToImage == null || data.opensource == null;
      return { value: data, ttl: ttlFor(partial, FIVE_MINUTES) };
    },
    { memoryOnly: true },
  );
}

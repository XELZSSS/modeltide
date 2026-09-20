import type { OfficialPriceModel } from "@/shared/types";
import { LITELLM_FETCH_OPTS, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AppContext } from "@/server/context";
import { parseLitellmPricing } from "@/server/parsers/official-pricing";
import { requireParsed } from "@/server/sources/pipeline";

export async function fetchLitellmPricing(ctx: AppContext): Promise<OfficialPriceModel[]> {
  const raw = await ctx.http.json<unknown>(
    `${upstreamConfig.githubRaw}${upstreamEndpoints.litellmPricing}`,
    LITELLM_FETCH_OPTS,
  );
  return requireParsed(parseLitellmPricing(raw));
}

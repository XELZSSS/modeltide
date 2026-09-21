import { STATIC_TTL_MS } from "@/shared/config";
import { LITELLM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { OfficialPriceModel, OfficialPricingPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { parseLitellmPricing } from "@/server/parsers/litellm-parser";
import { cachedSource, requireParsed } from "@/server/sources/pipeline";

async function fetchLitellmPricing(ctx: AppContext): Promise<OfficialPriceModel[]> {
  const raw = await ctx.http.json<unknown>(
    `${upstreamConfig.githubRaw}${upstreamEndpoints.litellmPricing}`,
    LITELLM_FETCH_OPTS,
  );
  return requireParsed(parseLitellmPricing(raw));
}

export const getOfficialPricing = (ctx: AppContext): Promise<OfficialPricingPayload> =>
  cachedSource(ctx, cacheKeys.officialPricing, STATIC_TTL_MS, async () => {
    const models = await fetchLitellmPricing(ctx);
    return { value: { models, fetchedAt: new Date().toISOString() } };
  });

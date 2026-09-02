import { STATIC_TTL_MS, cacheKeys } from "@/shared/config";
import type { OfficialPricingPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { getLitellmPricing } from "@/server/sources/pricing/litellm";

export const getOfficialPricing = (ctx: AppContext): Promise<OfficialPricingPayload> =>
  ctx.cache.withTtl(cacheKeys.officialPricing, STATIC_TTL_MS, async () => {
    const models = await getLitellmPricing(ctx);
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });

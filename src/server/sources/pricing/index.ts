import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { OfficialPricingPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { fetchLitellmPricing } from "@/server/sources/pricing/litellm";
import { cachedSource } from "@/server/sources/pipeline";

export const getOfficialPricing = (ctx: AppContext): Promise<OfficialPricingPayload> =>
  cachedSource(ctx, cacheKeys.officialPricing, STATIC_TTL_MS, async () => {
    const models = await fetchLitellmPricing(ctx);
    return { value: { models, fetchedAt: new Date().toISOString() } };
  });

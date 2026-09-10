import type { OfficialPriceModel } from "@/shared/types";
import { LITELLM_FETCH_OPTS, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AppContext } from "@/server/context";
import { parseLitellmPricing } from "@/server/parsers/official-pricing";

/** Raw fetch — no cache. The jsDelivr mirror was removed: the BerriAI/litellm
 * package exceeds jsDelivr's 50 MB limit so it permanently answers 403. */
export async function fetchLitellmPricing(ctx: AppContext): Promise<OfficialPriceModel[]> {
  const raw = await ctx.http.json<unknown>(
    `${upstreamConfig.githubRaw}${upstreamEndpoints.litellmPricing}`,
    LITELLM_FETCH_OPTS,
  );
  return parseLitellmPricing(raw);
}

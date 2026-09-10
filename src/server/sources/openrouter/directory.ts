import { SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { DirectoryCacheEntry, PricingRow } from "@/server/parsers/or-directory";
import { parseDirectoryRows } from "@/server/parsers/or-directory";

const PRICING_TTL_MS = SLOW_TTL_MS;

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  const res = await ctx.http.json<{ data: PricingRow[] }>(
    `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterDirectory}`,
    UPSTREAM_FETCH_OPTS,
  );
  return parseDirectoryRows(res?.data ?? []);
}

export async function getModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  return ctx.cache.withTtl<DirectoryCacheEntry>(cacheKeys.openRouterPricing, PRICING_TTL_MS, async () => {
    const data = await fetchModelDirectory(ctx);
    return { data };
  });
}

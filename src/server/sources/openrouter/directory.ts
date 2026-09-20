import { SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { parseDirectoryRows, type DirectoryCacheEntry } from "@/server/parsers/openrouter";
import type { PricingRow } from "@/server/parsers/upstream";
import { cachedSource } from "@/server/sources/pipeline";

const PRICING_TTL_MS = SLOW_TTL_MS;

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  const res = await ctx.http.json<{ data: PricingRow[] }>(
    `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterDirectory}`,
    UPSTREAM_FETCH_OPTS,
  );
  const rows = Array.isArray(res?.data) ? res.data : [];
  const entry = parseDirectoryRows(rows);
  if (Object.keys(entry.pricing).length === 0) {
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  }
  return entry;
}

export async function getModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  return cachedSource<DirectoryCacheEntry>(ctx, cacheKeys.openRouterPricing, PRICING_TTL_MS, async () => {
    const data = await fetchModelDirectory(ctx);
    return { value: data };
  });
}

import { SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { parseDirectoryRows, type DirectoryCacheEntry } from "@/server/parsers/openrouter-directory-parser";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";
import { cachedRaw, toPartial } from "@/server/sources/pipeline";

const PRICING_TTL_MS = SLOW_TTL_MS;
const PRICING_GAP_RATIO = 0.3;

export type DirectoryCacheEntryWithPartial = DirectoryCacheEntry & { partial: boolean };

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntryWithPartial> {
  const res = (await ctx.http.json<unknown>(
    upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory),
    UPSTREAM_FETCH_OPTS,
  )) as { data?: unknown } | null;
  const rows = Array.isArray(res?.data) ? res.data : [];
  const { entry, totalRows, missingPricing: missing } = parseDirectoryRows(rows);
  if (Object.keys(entry.pricing).length === 0) {
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  }
  const partial = missing >= Math.ceil(totalRows * PRICING_GAP_RATIO);
  if (partial) {
    ctx.log("warn", `[openrouter] directory pricing gaps`, { missing, totalRows });
  }
  return { ...entry, partial };
}

export async function getModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntryWithPartial> {
  const { value, degraded } = await cachedRaw<DirectoryCacheEntryWithPartial>(
    ctx,
    cacheKeys.openRouterPricing,
    PRICING_TTL_MS,
    fetchModelDirectory,
  );
  return toPartial(value, degraded);
}

export async function getModelDirectoryMeta(ctx: AppContext): Promise<Record<string, ModelMetaEntry>> {
  const { meta } = await getModelDirectory(ctx);
  return meta;
}

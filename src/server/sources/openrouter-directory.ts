import { SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import {
  directoryRowPricing,
  hasDynamicPricing,
  parseDirectoryRows,
  type DirectoryCacheEntry,
} from "@/server/parsers/openrouter-directory-parser";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";
import { cachedRaw } from "@/server/sources/pipeline";

const PRICING_TTL_MS = SLOW_TTL_MS;
const PRICING_GAP_RATIO = 0.3;

export type DirectoryCacheEntryWithPartial = DirectoryCacheEntry & { partial: boolean };

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntryWithPartial> {
  const res = (await ctx.http.json<unknown>(
    upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory),
    UPSTREAM_FETCH_OPTS,
  )) as { data?: unknown } | null;
  const rows = Array.isArray(res?.data) ? res.data : [];
  const entry = parseDirectoryRows(rows);
  if (Object.keys(entry.pricing).length === 0) {
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  }
  const missing = rows.filter((row) => directoryRowPricing(row) === null && !hasDynamicPricing(row)).length;
  const partial = missing >= Math.ceil(rows.length * PRICING_GAP_RATIO);
  if (partial) {
    ctx.log("warn", `[openrouter] directory pricing gaps: ${missing}/${rows.length} rows lack usable pricing`);
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
  return degraded ? { ...value, partial: true } : value;
}

export async function getModelDirectoryMeta(ctx: AppContext): Promise<Record<string, ModelMetaEntry>> {
  const { value } = await cachedRaw<Record<string, ModelMetaEntry>>(
    ctx,
    cacheKeys.openRouterMeta,
    PRICING_TTL_MS,
    async (ctx) => {
      const { meta } = await getModelDirectory(ctx);
      return meta;
    },
  );
  return value;
}

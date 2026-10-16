import { SLOW_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { parseDirectoryRows, type DirectoryCacheEntry } from "./parse-directory";
import type { ModelMetaEntry } from "@/server/formats/wire-types";
import { cachedRaw, toPartial } from "@/server/pipeline";

const PRICING_TTL_MS = SLOW_TTL_MS;
const PRICING_GAP_RATIO = 0.3;

export type DirectoryCacheEntryWithPartial = DirectoryCacheEntry & { partial: boolean };

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntryWithPartial> {
  const res = (await ctx.http.getJson<unknown>(
    upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory),
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

export async function getModelDirectoryMeta(
  ctx: AppContext,
): Promise<{ meta: Record<string, ModelMetaEntry>; partial: boolean }> {
  const { meta, partial } = await getModelDirectory(ctx);
  return { meta, partial };
}

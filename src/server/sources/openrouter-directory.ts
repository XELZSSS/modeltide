import { SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import {
  isRecord,
  isValidOpenRouterDirectoryRow,
  numCoerce,
  numCoerceNonNegative,
} from "@/server/parsers/parser-primitives";
import { parseDirectoryRows, type DirectoryCacheEntry } from "@/server/parsers/openrouter-parser";
import { cachedRaw } from "@/server/sources/pipeline";

const PRICING_TTL_MS = SLOW_TTL_MS;

type DirectoryCacheEntryWithPartial = DirectoryCacheEntry & { partial?: boolean };

/** `"-1"` prompt/completion is OpenRouter's documented "dynamic pricing" sentinel, not a degraded response. */
const DYNAMIC_PRICING = -1;

function hasUsablePricing(row: unknown): boolean {
  if (!isValidOpenRouterDirectoryRow(row) || !isRecord(row)) return false;
  const pricing = row.pricing;
  if (!isRecord(pricing)) return false;
  if (numCoerce(pricing.prompt) === DYNAMIC_PRICING && numCoerce(pricing.completion) === DYNAMIC_PRICING) {
    return true;
  }
  return numCoerceNonNegative(pricing.prompt) != null && numCoerceNonNegative(pricing.completion) != null;
}

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
  const partial = rows.some((row) => !hasUsablePricing(row));
  return partial ? { ...entry, partial: true } : entry;
}

export async function getModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntryWithPartial> {
  return cachedRaw<DirectoryCacheEntryWithPartial>(
    ctx,
    cacheKeys.openRouterPricing,
    PRICING_TTL_MS,
    fetchModelDirectory,
  );
}

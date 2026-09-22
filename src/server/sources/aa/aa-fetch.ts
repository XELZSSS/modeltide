import type { AppContext } from "@/server/context";
import { upstreamConfig } from "@/server/config";
import { errMsg } from "@/server/infra/task-pool";
import { parseRscPayload } from "@/server/parsers/rsc-parser";
import { fetchRscText } from "@/server/sources/rsc-fetcher";
import { cached } from "@/server/sources/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";

export async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries });
}

interface EnrichOptions<T> {
  /**
   * Enrichment pages move far slower than the index they ride on, so they take
   * their own longer-lived entry instead of being re-fetched on every rebuild.
   */
  cacheKey?: string;
  map?: (arr: T[]) => T[];
}

/**
 * Enrichment legs are optional: a failure logs and yields an empty array so the
 * caller keeps its un-enriched rows. A failed fetch writes nothing, so a broken
 * leg is retried on the next build instead of being frozen for a whole TTL.
 */
export async function fetchAndParseEnrich<T>(
  ctx: AppContext,
  label: string,
  path: string,
  marker: string,
  extract: (tree: unknown) => T[] | null,
  options: EnrichOptions<T> = {},
): Promise<T[]> {
  let body: string;
  try {
    body = await fetchEnrichBody(ctx, path, options.cacheKey);
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment failed: ${errMsg(err)}`);
    return [];
  }
  try {
    const arr = parseRscPayload<T>(body, marker, extract);
    return options.map ? options.map(arr) : arr;
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment parse failed: ${errMsg(err)}`);
    return [];
  }
}

function fetchEnrichBody(ctx: AppContext, path: string, cacheKey?: string): Promise<string> {
  const load = (): Promise<string> => fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries: 0 });
  if (!cacheKey) return load();
  return cached(ctx, cacheKey, SLOW_TTL_MS, async () => ({ data: await load() }));
}

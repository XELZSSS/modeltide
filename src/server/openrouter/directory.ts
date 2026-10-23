import { SLOW_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { parseDirectoryRows, type DirectoryCacheEntry } from "./parse-directory";
import { defineSource } from "@/server/pipeline";

const PRICING_GAP_RATIO = 0.3;

interface DirectoryRaw {
  entry: DirectoryCacheEntry;
  partial: boolean;
}

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryRaw> {
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
  return { entry, partial };
}

export const getModelDirectory = defineSource<DirectoryRaw, DirectoryCacheEntry>({
  key: cacheKeys.openRouterPricing,
  ttl: SLOW_TTL_MS,
  label: "OpenRouter directory",
  fetch: (ctx) => fetchModelDirectory(ctx),
  parse: (raw) => raw.entry,
  partialWhen: ({ raw }) => ({ partial: raw.partial }),
});

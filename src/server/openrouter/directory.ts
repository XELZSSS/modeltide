import { SLOW_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { isRecord } from "@/server/formats/scalars";
import { parseDirectoryRows, type DirectoryCacheEntry } from "./parse-directory";
import { definePartialSource, type PartialData } from "@/server/pipeline";

const PRICING_GAP_RATIO = 0.3;

async function fetchModelDirectory(ctx: AppContext): Promise<PartialData<DirectoryCacheEntry>> {
  const res: unknown = await ctx.http.json(
    upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory),
  );
  // A non-array `data` is a wire-shape failure, not an empty directory: collapsing it reported it as "empty pricing" and hid which happened.
  if (!isRecord(res) || !Array.isArray(res.data)) {
    throw new UpstreamError("OpenRouter: directory returned a non-array response");
  }
  const rows = res.data;
  const { entry, totalRows, missingPricing: missing } = parseDirectoryRows(rows);
  if (entry.pricingKeys === 0) {
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  }
  const partial = missing >= Math.ceil(totalRows * PRICING_GAP_RATIO);
  if (partial) {
    ctx.log("warn", `[openrouter] directory pricing gaps`, { missing, totalRows });
  }
  return { data: entry, partial };
}

export const getModelDirectory = definePartialSource<DirectoryCacheEntry>({
  key: cacheKeys.openRouterPricing,
  ttl: SLOW_TTL_MS,
  label: "OpenRouter directory",
  fetch: (ctx) => fetchModelDirectory(ctx),
});

import { SLOW_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { isRecord } from "@/server/formats/scalars";
import { parseDirectoryRows, type DirectoryCacheEntry } from "./parse-directory";
import { definePartialSource } from "@/server/pipeline";

const PRICING_GAP_RATIO = 0.3;

interface DirectoryRaw {
  entry: DirectoryCacheEntry;
  partial: boolean;
}

async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryRaw> {
  const res: unknown = await ctx.http.json(
    upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory),
  );
  // A non-array `data` is a wire-shape failure, not an empty directory: collapsing it here reported it as "empty pricing"
  // further down and hid which of the two actually happened.
  if (!isRecord(res) || !Array.isArray(res.data)) {
    throw new UpstreamError("OpenRouter: directory returned a non-array response");
  }
  const rows = res.data;
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

export const getModelDirectory = definePartialSource<DirectoryRaw, DirectoryCacheEntry>({
  key: cacheKeys.openRouterPricing,
  ttl: SLOW_TTL_MS,
  label: "OpenRouter directory",
  fetch: (ctx) => fetchModelDirectory(ctx),
  pick: (raw) => raw.entry,
});

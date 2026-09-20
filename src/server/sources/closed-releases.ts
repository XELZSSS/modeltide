import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { getChangelogModels } from "@/server/sources/aa/changelog";
import { getIntelligenceIndexResult } from "@/server/sources/aa/intelligence-index";
import { toClosedReleases, toClosedReleasesFromIndex } from "@/server/parsers/closed-releases";
import type { SourcePayload } from "@/server/sources/types";
import { cachedPayload } from "@/server/sources/pipeline";

async function fetchClosedReleases(ctx: AppContext): Promise<{ entries: ClosedReleaseEntry[]; partial: boolean }> {
  const [index, changelog] = await Promise.all([getIntelligenceIndexResult(ctx), getChangelogModels(ctx)]);
  const models = index.models;
  if (models.length === 0 && changelog.length === 0)
    throw new UpstreamError(`Closed releases: both index and changelog failed`);
  const weights = new Map<string, boolean>(Object.entries(index.weights ?? {}));
  const entries = toClosedReleases(changelog, weights);
  ctx.log("info", `[closed-releases] closed=${entries.length} (changelog=${changelog.length}, index=${models.length})`);
  let finalEntries = entries;
  if (finalEntries.length === 0 && models.length > 0) {
    finalEntries = toClosedReleasesFromIndex(models);
    ctx.log("warn", `[closed-releases] changelog empty, index fallback closed=${finalEntries.length}`);
  }
  if (finalEntries.length === 0)
    throw new UpstreamError(`Closed releases yielded 0 rows (changelog=${changelog.length}, index=${models.length})`);
  const partial = index.enrichFailed;
  if (partial) ctx.log("warn", "[closed-releases] serving partial (degraded enrichment)");
  return { entries: finalEntries, partial };
}

export const getClosedReleases = (ctx: AppContext): Promise<SourcePayload<ClosedReleaseEntry[]>> =>
  cachedPayload(
    ctx,
    cacheKeys.closedReleases,
    STATIC_TTL_MS,
    async () => {
      const { entries: finalEntries, partial } = await fetchClosedReleases(ctx);
      return { rows: finalEntries, partial };
    },
    { memoryOnly: true },
  );

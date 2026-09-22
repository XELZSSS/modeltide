import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, rethrowIfAllAborted } from "@/server/infra/errors";
import { getChangelogModels } from "@/server/sources/aa/changelog-source";
import { getIntelligenceIndexResult } from "@/server/sources/aa/index-source";
import { toClosedReleases, toClosedReleasesFromIndex } from "@/server/parsers/closed-releases-parser";
import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";
import { errMsg } from "@/server/infra/task-pool";

async function fetchClosedReleases(ctx: AppContext): Promise<{ entries: ClosedReleaseEntry[]; partial: boolean }> {
  // allSettled: either leg alone can build the list (see the index fallback).
  // No open/closed join here: upstream cannot say which releases are open
  // (see the note in closed-releases-parser.ts), so every release is returned.
  const [indexResult, changelogResult] = await Promise.allSettled([
    getIntelligenceIndexResult(ctx),
    getChangelogModels(ctx),
  ]);
  const index = indexResult.status === "fulfilled" ? indexResult.value : undefined;
  const changelog = changelogResult.status === "fulfilled" ? changelogResult.value : [];
  if (indexResult.status === "rejected") {
    ctx.log("warn", `[closed-releases] index leg failed: ${errMsg(indexResult.reason)}`);
  }
  if (changelogResult.status === "rejected") {
    ctx.log("warn", `[closed-releases] changelog leg failed: ${errMsg(changelogResult.reason)}`);
  }
  const models = index?.models ?? [];
  if (models.length === 0 && changelog.length === 0) {
    rethrowIfAllAborted([indexResult, changelogResult]);
    throw new UpstreamError(`Releases: both index and changelog failed`);
  }
  const entries = toClosedReleases(changelog);
  ctx.log("info", `[closed-releases] rows=${entries.length} (changelog=${changelog.length}, index=${models.length})`);
  let finalEntries = entries;
  const indexFallback = finalEntries.length === 0 && models.length > 0;
  if (indexFallback) {
    finalEntries = toClosedReleasesFromIndex(models);
    ctx.log("warn", `[closed-releases] changelog empty, index fallback rows=${finalEntries.length}`);
  }
  requireRows(finalEntries, "Releases", "rows", `changelog=${changelog.length}, index=${models.length}`);
  // Rebuilt from the index: the changelog leg contributed nothing usable.
  const partial = index == null || index.enrichFailed || indexFallback;
  if (partial) ctx.log("warn", "[closed-releases] serving partial (degraded enrichment)");
  return { entries: finalEntries, partial };
}

export const getClosedReleases = (ctx: AppContext): Promise<SourcePayload<ClosedReleaseEntry[]>> =>
  // memoryOnly is deliberate: the join is cheap and both legs are KV-cached.
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

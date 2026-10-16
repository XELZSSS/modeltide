import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig } from "@/server/upstream/upstream";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { errMsg, UpstreamError } from "@/server/api/errors";
import { getChangelogModels } from "@/server/aa/changelog";
import { getIntelligenceIndexResult } from "@/server/aa";
import { runLegs } from "@/server/join-legs";
import { toClosedReleases, toClosedReleasesFromIndex } from "./parse";
import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/pipeline";

async function fetchClosedReleases(ctx: AppContext): Promise<{ entries: ClosedReleaseEntry[]; partial: boolean }> {
  const { values } = await runLegs(
    [
      { label: "index", run: () => getIntelligenceIndexResult(ctx) },
      { label: "changelog", run: () => getChangelogModels(ctx) },
    ],
    { onFailure: (f) => ctx.log("warn", `[closed-releases] ${f.label} leg failed: ${errMsg(f.reason)}`) },
  );
  const [index, changelog] = values;
  const models = index?.models ?? [];
  const changelogModels = changelog?.models ?? [];
  if (models.length === 0 && changelogModels.length === 0) {
    throw new UpstreamError(`Releases: both index and changelog failed`, { retryable: true });
  }
  const entries = toClosedReleases(changelogModels, upstreamConfig.artificialAnalysis);
  ctx.log(
    "info",
    `[closed-releases] rows=${entries.length} (changelog=${changelogModels.length}, index=${models.length})`,
  );
  let finalEntries = entries;
  const indexFallback = finalEntries.length === 0 && models.length > 0;
  if (indexFallback) {
    finalEntries = toClosedReleasesFromIndex(models, upstreamConfig.artificialAnalysis);
    ctx.log("warn", `[closed-releases] changelog empty, index fallback rows=${finalEntries.length}`);
  }
  requireRows(finalEntries, "Releases", "rows", `changelog=${changelogModels.length}, index=${models.length}`);
  const partial = index == null || index.enrichFailed || indexFallback || changelog?.degraded === true;
  if (partial) ctx.log("warn", "[closed-releases] serving partial (degraded enrichment)");
  return { entries: finalEntries, partial };
}

export const getClosedReleases = (ctx: AppContext): Promise<SourcePayload<ClosedReleaseEntry[]>> =>
  cachedPayload(ctx, cacheKeys.closedReleases, STATIC_TTL_MS, async (ctx) => {
    const { entries: finalEntries, partial } = await fetchClosedReleases(ctx);
    return { rows: finalEntries, partial };
  });

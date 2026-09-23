import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { getChangelogModels } from "@/server/sources/aa/changelog-source";
import { getIntelligenceIndexResult } from "@/server/sources/aa/index-source";
import { runLegs } from "@/server/sources/join-legs";
import { toClosedReleases, toClosedReleasesFromIndex } from "@/server/parsers/closed-releases-parser";
import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";
import { errMsg } from "@/server/infra/task-pool";

async function fetchClosedReleases(ctx: AppContext): Promise<{ entries: ClosedReleaseEntry[]; partial: boolean }> {
  // No open/closed join: upstream cannot say which releases are open; every row is returned.
  const { values } = await runLegs(
    [
      { label: "index", run: () => getIntelligenceIndexResult(ctx) },
      { label: "changelog", run: () => getChangelogModels(ctx) },
    ],
    { onFailure: (f) => ctx.log("warn", `[closed-releases] ${f.label} leg failed: ${errMsg(f.reason)}`) },
  );
  const [index, changelog = []] = values;
  const models = index?.models ?? [];
  if (models.length === 0 && changelog.length === 0) {
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
  const partial = index == null || index.enrichFailed || indexFallback;
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

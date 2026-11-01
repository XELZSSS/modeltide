import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig } from "@/server/upstream/upstream";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { getChangelogModels } from "@/server/aa/changelog";
import { getIntelligenceIndex } from "@/server/aa";
import { fanOut } from "@/server/fan-out";
import { toClosedReleases, toClosedReleasesFromIndex } from "./parse";
import { definePartialSource, requireRows, type PartialData } from "@/server/pipeline";

async function fetchClosedReleases(ctx: AppContext): Promise<PartialData<ClosedReleaseEntry[]>> {
  const { values } = await fanOut(
    ctx,
    [
      { label: "index", run: () => getIntelligenceIndex(ctx) },
      { label: "changelog", run: () => getChangelogModels(ctx) },
    ],
    { tag: "closed-releases" },
  );
  const [index, changelog] = values;
  const models = index?.payload.data ?? [];
  const changelogModels = changelog?.payload.data ?? [];
  // Broader than runLegs' `allFailedMessage`: this fires when neither source produced a usable row, which also covers
  // a leg that fulfilled with an empty array. The fan-out therefore stays without that option.
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
  // The row check lives here rather than in a `refine` of its own: the counts it reports are already in scope, and a
  // throw out of `fetch` reports failure the way every other source does.
  requireRows(finalEntries, "Releases", "rows", `changelog=${changelogModels.length}, index=${models.length}`);
  const partial = index == null || index.payload.partial || indexFallback || changelog?.payload.partial === true;
  if (partial) ctx.log("warn", "[closed-releases] serving partial (degraded enrichment)");
  return { data: finalEntries, partial };
}

export const getClosedReleases = definePartialSource<ClosedReleaseEntry[]>({
  key: cacheKeys.closedReleases,
  ttl: STATIC_TTL_MS,
  label: "Releases",
  served: true,
  fetch: (ctx) => fetchClosedReleases(ctx),
});

import { STATIC_TTL_MS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { settled } from "@/server/infra/pool";
import { getChangelogModels } from "@/server/sources/aa/changelog";
import { getIntelligenceIndexResult } from "@/server/sources/aa/intelligence-index";
import { toClosedReleases, toClosedReleasesFromIndex } from "@/server/parsers/closed-releases";
import { nowIso, type SourcePayload } from "@/server/sources/types";

async function fetchClosedReleases(ctx: AppContext): Promise<{ entries: ClosedReleaseEntry[]; partial: boolean }> {
  const [indexRes, changelogRes] = await Promise.allSettled([getIntelligenceIndexResult(ctx), getChangelogModels(ctx)]);
  const index = settled(indexRes, { models: [], weights: {}, enrichFailed: true });
  const models = index.models;
  const changelog = settled(changelogRes, []);
  if (indexRes.status === "rejected") ctx.log("warn", `[closed-releases] index failed, changelog-only`);
  if (changelogRes.status === "rejected") ctx.log("warn", `[closed-releases] changelog failed, index-only`);
  if (models.length === 0 && changelog.length === 0)
    throw new UpstreamError(`Closed releases: both index and changelog failed`);
  // Weights come from the full pre-slice index (not the capped serving list),
  // so releases outside the top 100 still resolve exactly.
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
  const partial = index.enrichFailed || indexRes.status === "rejected" || changelogRes.status === "rejected";
  if (partial) ctx.log("warn", "[closed-releases] serving partial (source failure or degraded enrichment)");
  return { entries: finalEntries, partial };
}

export const getClosedReleases = (ctx: AppContext): Promise<SourcePayload<ClosedReleaseEntry[]>> =>
  ctx.cache.withTtl<SourcePayload<ClosedReleaseEntry[]>>(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    const { entries: finalEntries, partial } = await fetchClosedReleases(ctx);
    return {
      data: { data: finalEntries, fetchedAt: nowIso(), ...(partial ? { partial: true } : {}) },
      ttl: ttlFor(partial, STATIC_TTL_MS),
    };
  });

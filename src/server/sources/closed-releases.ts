import { SOURCE_LIMITS, STATIC_TTL_MS, ttlFor } from "@/shared/config";
import { cacheKeys, upstreamConfig } from "@/server/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { settled } from "@/server/infra/pool";
import { isoDate } from "@/server/parsers/primitives";
import { byDateDesc } from "@/server/parsers/shaping";
import { getChangelogModels, type ChangelogModel } from "@/server/sources/aa/changelog";
import { getIntelligenceIndexResult } from "@/server/sources/aa/intelligence-index";
import { dedupeBy } from "@/shared/utils";
import { nowIso, type SourcePayload } from "@/server/sources/types";

/**
 * The only closed-source signal: the open-weights flag from the intelligence
 * index. A release is closed unless it is explicitly flagged as open weights.
 * Unknown flags count as closed — unverified weights are not open weights.
 */
export function isClosedChangelogRelease(e: ChangelogModel, weights: Map<string, boolean>): boolean {
  return (weights.get(e.slug) ?? weights.get(e.releaseSlug)) !== true;
}

function toClosedEntry(id: string, model: string, provider: string, rawDate: string): ClosedReleaseEntry | null {
  const date = rawDate.length > 10 ? rawDate.slice(0, 10) : rawDate;
  if (!isoDate(date)) return null;
  return {
    id,
    model,
    provider,
    releaseDate: date,
    link: `${upstreamConfig.artificialAnalysis}/models/${encodeURIComponent(id)}`,
  };
}

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry | null {
  return toClosedEntry(e.releaseSlug, e.releaseName, e.creatorName, e.releaseDate);
}

function toClosedReleaseFromIndex(m: ArtificialAnalysisModel): ClosedReleaseEntry | null {
  if (m.is_open_weights === true) return null;
  return toClosedEntry(m.slug || m.id, m.name, m.model_creators?.name ?? "Unknown", m.release_date ?? "");
}

function toClosedReleasesFromIndex(models: ArtificialAnalysisModel[]): ClosedReleaseEntry[] {
  const entries = models.map(toClosedReleaseFromIndex).filter((e): e is ClosedReleaseEntry => e !== null);
  const deduped = dedupeBy(entries, (e) => e.id);
  deduped.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return deduped.slice(0, SOURCE_LIMITS.closedReleases);
}

export function toClosedReleases(changelog: ChangelogModel[], weights: Map<string, boolean>): ClosedReleaseEntry[] {
  const sorted = [...changelog]
    .filter((e) => isClosedChangelogRelease(e, weights))
    .sort(byDateDesc((e) => e.releaseDate));
  const entries = dedupeBy(sorted, (e) => e.releaseSlug)
    .map(toClosedRelease)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  // releaseDate is a validated zero-padded ISO date, so the pre-dedupe
  // Date.parse sort already is lexicographic order; no re-sort needed.
  return entries.slice(0, SOURCE_LIMITS.closedReleases);
}

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

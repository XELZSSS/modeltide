import { SOURCE_LIMITS } from "@/shared/config";
import { upstreamConfig } from "@/server/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";
import { isoDate } from "@/server/parsers/primitives";
import { byDateDesc } from "@/server/parsers/shaping";
import type { ChangelogModel } from "@/server/parsers/aa-changelog";
import { dedupeBy } from "@/shared/utils";

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

export function toClosedReleasesFromIndex(models: ArtificialAnalysisModel[]): ClosedReleaseEntry[] {
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

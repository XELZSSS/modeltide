import { isoDateOnly, sortByDateDesc } from "@/server/formats/dates";
import { MAX_ID_CHARS, MAX_NAME_CHARS } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";

import type { ChangelogModel } from "@/server/aa/parse/changelog";
import { dedupeBy } from "@/shared/utils";
import { aaModelPageUrl } from "@/shared/utils/models";

function toClosedEntry(
  id: string,
  modelSlug: string,
  model: string,
  provider: string,
  rawDate: string,
  modelsBaseUrl: string,
): ClosedReleaseEntry | null {
  const cleanId = id.trim();
  const cleanSlug = modelSlug.trim();
  const cleanModel = model.trim();
  const cleanProvider = provider.trim();
  if (!cleanId || !cleanModel || !cleanProvider) return null;
  if (cleanId.length > MAX_ID_CHARS || cleanModel.length > MAX_ID_CHARS || cleanProvider.length > MAX_NAME_CHARS)
    return null;
  const date = isoDateOnly(rawDate.slice(0, 10));
  if (!date) return null;
  return {
    id: cleanId,
    model: cleanModel,
    provider: cleanProvider,
    releaseDate: date,
    // AA serves a model page at its **model** slug, and a release slug only equals that for some releases: where it does
    // not (`ling-3-1-flash-rc5` announces the model page `ling-3-1-flash-1019`) the link answered 404. The row keeps its
    // release id as identity and points at the model page; a release whose model slug the source does not give us stays
    // in the list without a link rather than with a dead one.
    link: cleanSlug ? aaModelPageUrl(modelsBaseUrl, cleanSlug) : null,
  };
}

function toClosedRelease(e: ChangelogModel, modelsBaseUrl: string): ClosedReleaseEntry | null {
  return toClosedEntry(e.releaseSlug, e.slug, e.releaseName, e.creatorName, e.releaseDate, modelsBaseUrl);
}

/**
 * The changelog-empty fallback: the caller passes the already-compacted index rows, so the shape is established and
 * only the release fields are picked out of each one.
 */
function toClosedReleaseFromIndex(m: ArtificialAnalysisModel, modelsBaseUrl: string): ClosedReleaseEntry | null {
  const slug = m.slug.trim() !== "" ? m.slug : m.id;
  if (!slug || !m.name) return null;
  return toClosedEntry(slug, slug, m.name, m.model_creators?.name ?? "", m.release_date ?? "", modelsBaseUrl);
}

export function toClosedReleasesFromIndex(
  models: readonly ArtificialAnalysisModel[],
  modelsBaseUrl: string,
): ClosedReleaseEntry[] {
  const entries = models
    .map((m) => toClosedReleaseFromIndex(m, modelsBaseUrl))
    .filter((e): e is ClosedReleaseEntry => e !== null);
  const deduped = dedupeBy(entries, (e) => e.id);
  deduped.sort((a, b) => (a.releaseDate === b.releaseDate ? 0 : a.releaseDate < b.releaseDate ? 1 : -1));
  return deduped;
}

export function toClosedReleases(changelog: ChangelogModel[], modelsBaseUrl: string): ClosedReleaseEntry[] {
  // Sorted in place: this function owns the output order, and the array is the changelog parse's own with no other
  // reader.
  sortByDateDesc(changelog, (e) => e.releaseDate);
  const entries: ClosedReleaseEntry[] = [];
  const seen = new Set<string>();
  for (const record of changelog) {
    const entry = toClosedRelease(record, modelsBaseUrl);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

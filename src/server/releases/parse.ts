import { isoDatePrefix, sortByDateDesc } from "@/server/formats/dates";
import { MAX_ID_CHARS, MAX_NAME_CHARS } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";

import type { ChangelogModel } from "@/server/aa/wire";
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
  const date = isoDatePrefix(rawDate);
  if (!date) return null;
  return {
    id: cleanId,
    model: cleanModel,
    provider: cleanProvider,
    releaseDate: date,
    // AA serves a model page at its **model** slug, and a release slug only equals that for some releases: where it does
    // not (`ling-3-1-flash-rc5` announces the model page `ling-3-1-flash-1019`) the link answered 404. The row is the
    // model — its id is that same slug — and points at that page; a row whose model slug the source does not give us
    // stays in the list without a link rather than with a dead one.
    link: cleanSlug ? aaModelPageUrl(modelsBaseUrl, cleanSlug) : null,
  };
}

/**
 * One row per **variant**. `ChangelogModel` carries both identities — the release family (`releaseSlug`) and the model
 * this row is (`slug`) — and the feed keys on the model, because `DeepSeek V4.1 Flash 1017 (Max)` and
 * `(Non-reasoning)` are two entries a reader distinguishes even though AA files them under one release.
 */
function toClosedRelease(e: ChangelogModel, modelsBaseUrl: string): ClosedReleaseEntry | null {
  return toClosedEntry(e.slug, e.slug, e.name, e.creatorName, e.releaseDate, modelsBaseUrl);
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
  sortByDateDesc(deduped, (e) => e.releaseDate);
  return deduped;
}

/**
 * One row per model variant, newest release first.
 *
 * Variants of one release share a `releaseDate` and an entry in AA's `releases` array, so the feed used to collapse them
 * onto the release and print the family name — `DeepSeek V4.1 Flash 1017` hid both `(Max)` and `(Non-reasoning)`. A
 * release event is per model here, which is also the identity the index fallback (`toClosedReleasesFromIndex`) already
 * used, so the two paths now name a row the same way instead of carrying disjoint id spaces.
 *
 * Order within one date is the changelog's own: `sortByDateDesc` is stable and keeps AA's row order for a family, which
 * is its own ranking order.
 */
export function toClosedReleases(changelog: ChangelogModel[], modelsBaseUrl: string): ClosedReleaseEntry[] {
  // Sorted in place: this function owns the output order, and the array is the changelog parse's own with no other
  // reader.
  sortByDateDesc(changelog, (e) => e.releaseDate);
  const entries = changelog
    .map((record) => toClosedRelease(record, modelsBaseUrl))
    .filter((entry): entry is ClosedReleaseEntry => entry !== null);
  // Keyed on the model slug, so two variants of one release are two rows rather than one.
  return dedupeBy(entries, (e) => e.id);
}

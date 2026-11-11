import { isoDatePrefix, sortByDateDesc } from "@/server/formats/dates";
import { MAX_ID_CHARS, MAX_NAME_CHARS } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";

import type { ChangelogModel } from "@/server/aa/wire";
import { dedupeBy } from "@/shared/utils";
import { aaModelPageUrl } from "@/shared/utils/models";

/** The four facts a release row is built from, as each caller already holds them. */
interface ReleaseFacts {
  slug: string;
  model: string;
  provider: string;
  date: string;
}

/** The one mapper both callers go through: the changelog and the index fallback differ only in where the four facts come from. `slug` is the release's **model** slug, not its release family — AA serves a model page at the model slug, and the two are equal only for some releases (`ling-3-1-flash-rc5` announces `ling-3-1-flash-1019`). */
function toClosedRelease(facts: ReleaseFacts, modelsBaseUrl: string): ClosedReleaseEntry | null {
  const id = facts.slug.trim();
  const model = facts.model.trim();
  const provider = facts.provider.trim();
  if (!id || !model || !provider) return null;
  if (id.length > MAX_ID_CHARS || model.length > MAX_ID_CHARS || provider.length > MAX_NAME_CHARS) return null;
  const releaseDate = isoDatePrefix(facts.date);
  if (!releaseDate) return null;
  return { id, model, provider, releaseDate, link: aaModelPageUrl(modelsBaseUrl, id) };
}

/** The changelog-empty fallback: the caller passes the already-compacted index rows, so the mapper alone decides what makes a usable release. */
function toClosedReleaseFromIndex(m: ArtificialAnalysisModel, modelsBaseUrl: string): ClosedReleaseEntry | null {
  return toClosedRelease(
    {
      // AA leaves the slug blank on some index rows; the id is the same identity when it is.
      slug: m.slug.trim() !== "" ? m.slug : m.id,
      model: m.name,
      // A row with no creator or no release date is not a release, and the mapper drops it on the empty field.
      provider: m.model_creators?.name ?? "",
      date: m.release_date ?? "",
    },
    modelsBaseUrl,
  );
}

export function toClosedReleasesFromIndex(
  models: readonly ArtificialAnalysisModel[],
  modelsBaseUrl: string,
): ClosedReleaseEntry[] {
  const entries = models
    .map((m) => toClosedReleaseFromIndex(m, modelsBaseUrl))
    .filter((e): e is ClosedReleaseEntry => e !== null);
  // Keyed on the model slug, so two variants of one release are two rows rather than one.
  const deduped = dedupeBy(entries, (e) => e.id);
  sortByDateDesc(deduped, (e) => e.releaseDate);
  return deduped;
}

/**
 * One row per model variant, newest release first. Variants of one release share a `releaseDate` and an entry in AA's
 * `releases` array, so the feed keys on the model (`ChangelogModel.slug`), not the release family: `DeepSeek V4.1 Flash
 * 1017 (Max)` and `(Non-reasoning)` are two entries a reader distinguishes. Order within one date is the changelog's own:
 * `sortByDateDesc` is stable and keeps AA's row order for a family.
 */
export function toClosedReleases(changelog: ChangelogModel[], modelsBaseUrl: string): ClosedReleaseEntry[] {
  // Sorted in place: this function owns the output order, and the array has no other reader.
  sortByDateDesc(changelog, (e) => e.releaseDate);
  const entries = changelog
    .map((e) =>
      toClosedRelease({ slug: e.slug, model: e.name, provider: e.creatorName, date: e.releaseDate }, modelsBaseUrl),
    )
    .filter((entry): entry is ClosedReleaseEntry => entry !== null);
  return dedupeBy(entries, (e) => e.id);
}

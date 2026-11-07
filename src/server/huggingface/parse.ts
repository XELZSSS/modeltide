import { isRecord, numIntCoerceNonNegative, text, textOrNull } from "@/server/formats/scalars";
import { isoDate } from "@/server/formats/dates";
import { isValidRowId } from "@/server/formats/content-guards";
import type { OpenSourceModelEntry } from "@/shared/types";
import { getOpenLicenseId, licenseTagId } from "@/server/formats/licenses";
import type { HfModel } from "./wire";
import type { LicenseDropTally } from "./license-tally";

function resolveAuthor(m: HfModel, id: string): string | null {
  const explicit = textOrNull(m.author);
  if (explicit) return explicit;
  const slash = id.indexOf("/");
  const owner = slash === -1 ? id : id.slice(0, slash);
  return owner.trim() || null;
}

export function mapModel(m: unknown): OpenSourceModelEntry | null {
  return toEntry(m, true);
}

export function mapListModel(m: unknown, tally?: LicenseDropTally): OpenSourceModelEntry | null {
  return toEntry(m, false, tally);
}

export function keepOpenSourceRanking(m: { downloads: number }, tally?: LicenseDropTally): boolean {
  if (Number.isFinite(m.downloads) && m.downloads > 0) return true;
  tally?.recordNoDownloads();
  return false;
}

function toEntry(m: unknown, includeTags: boolean, tally?: LicenseDropTally): OpenSourceModelEntry | null {
  if (!isRecord(m)) return null;
  const model: HfModel = m;
  if (!isValidRowId(model.id)) return null;
  const id = text(model.id);
  const downloads = numIntCoerceNonNegative(model.downloads) ?? 0;
  const likes = numIntCoerceNonNegative(model.likes) ?? 0;
  // Licences come out of `tags` in the walk that also builds the detail row's tag list: a list row keeps no tags, so
  // the old `filter` built a filtered copy for all 1000 rows and dropped it, while the licence still had to be found.
  const tags: string[] = [];
  const licenseIds: string[] = [];
  for (const tag of Array.isArray(model.tags) ? model.tags : []) {
    if (typeof tag !== "string") continue;
    if (includeTags) tags.push(tag);
    const licenseId = licenseTagId(tag);
    if (licenseId) licenseIds.push(licenseId);
  }
  const license = getOpenLicenseId(licenseIds);
  tally?.record(licenseIds, license);
  const entry: OpenSourceModelEntry = {
    id,
    author: resolveAuthor(model, id),
    downloads,
    likes,
    license,
    task: textOrNull(model.pipeline_tag),
    createdAt: isoDate(model.createdAt),
    lastModified: isoDate(model.lastModified),
  };
  // Tags belong to the detail payload only. A ranking row is one of up to 1000 and tags are the largest field on it,
  // so `mapListModel` leaves the key out entirely; the expanded row renders the facts the row actually carries.
  if (includeTags) entry.tags = tags.slice(0, 100);
  return entry;
}

import { isRecord, numIntCoerceNonNegative, text, textOrNull } from "@/server/formats/scalars";
import { isoDate } from "@/server/formats/dates";
import { isValidRowId } from "@/server/formats/content-guards";
import type { OpenSourceModelEntry } from "@/shared/types";
import { getOpenLicenseId, licenseTagId } from "@/server/formats/licenses";
import type { HfModel } from "./wire";
import type { LicenseDropTally } from "./license-tally";

/** What one wire row is mapped into; the two variants are named so a variant gains a field without every caller's argument list shifting. */
interface EntryOptions {
  /** The detail variant keeps its tag list; the up-to-1000-row list variant leaves the key out. */
  tags: boolean;
  /** The page-wide licence gate, when the caller reports on it. */
  tally?: LicenseDropTally;
}

function resolveAuthor(m: HfModel, id: string): string | null {
  const explicit = textOrNull(m.author);
  if (explicit) return explicit;
  const slash = id.indexOf("/");
  const owner = slash === -1 ? id : id.slice(0, slash);
  return owner.trim() || null;
}

/** The two variants as shared options objects: a ranking page maps up to 1000 rows, so the list variant must not build a fresh object per row. */
const DETAIL_ROW: EntryOptions = { tags: true };
const LIST_ROW: EntryOptions = { tags: false };

export function mapModel(m: unknown): OpenSourceModelEntry | null {
  return toEntry(m, DETAIL_ROW);
}

export function mapListModel(m: unknown, tally?: LicenseDropTally): OpenSourceModelEntry | null {
  return toEntry(m, tally === undefined ? LIST_ROW : { tags: false, tally });
}

export function keepOpenSourceRanking(m: { downloads: number }, tally?: LicenseDropTally): boolean {
  if (Number.isFinite(m.downloads) && m.downloads > 0) return true;
  tally?.recordNoDownloads();
  return false;
}

function toEntry(m: unknown, opts: EntryOptions): OpenSourceModelEntry | null {
  if (!isRecord(m)) return null;
  const model: HfModel = m;
  if (!isValidRowId(model.id)) return null;
  const id = text(model.id);
  const downloads = numIntCoerceNonNegative(model.downloads) ?? 0;
  const likes = numIntCoerceNonNegative(model.likes) ?? 0;
  // Licences come out of `tags` in the walk that also builds the detail row's tag list: a list row keeps no tags, so a separate `filter` built a copy of every row and dropped it.
  const tags: string[] = [];
  const licenseIds: string[] = [];
  for (const tag of Array.isArray(model.tags) ? model.tags : []) {
    if (typeof tag !== "string") continue;
    if (opts.tags) tags.push(tag);
    const licenseId = licenseTagId(tag);
    if (licenseId) licenseIds.push(licenseId);
  }
  const license = getOpenLicenseId(licenseIds);
  opts.tally?.record(licenseIds, license);
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
  // Tags belong to the detail payload only: a ranking row is one of up to 1000 and tags are the largest field on it.
  if (opts.tags) entry.tags = tags.slice(0, 100);
  return entry;
}

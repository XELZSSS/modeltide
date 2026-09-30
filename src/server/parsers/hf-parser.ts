import { isRecord, isoDate, numIntCoerceNonNegative, isValidRowId } from "@/server/parsers/parser-primitives";
import { toStringOrNull } from "@/shared/utils";
import type { OpenSourceModelEntry } from "@/shared/types";
import { getOpenLicenseId, isRecognizedNonOpenLicense, licenseTagId } from "@/server/parsers/licenses";
import type { HFModel } from "@/server/parsers/upstream-types";

function resolveAuthor(m: HFModel, id: string): string | null {
  return toStringOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

interface LicenseDrops {
  withoutTag: number;
  declaredNonOpen: number;
  unknownTags: string[];
  noDownloads: number;
}

const MAX_UNKNOWN_LICENSE_TAGS = 5;

export class LicenseDropTally {
  private withoutTag = 0;
  private declaredNonOpen = 0;
  private noDownloads = 0;
  private readonly unknownTags = new Set<string>();

  record(ids: readonly string[], license: string | null): void {
    if (ids.length === 0) {
      this.withoutTag += 1;
      return;
    }
    if (license != null) return;
    this.declaredNonOpen += 1;
    for (const id of ids) {
      if (isRecognizedNonOpenLicense(id) || this.unknownTags.has(id)) continue;
      if (this.unknownTags.size >= MAX_UNKNOWN_LICENSE_TAGS) break;
      this.unknownTags.add(id);
    }
  }

  drops(): LicenseDrops {
    return {
      withoutTag: this.withoutTag,
      declaredNonOpen: this.declaredNonOpen,
      unknownTags: [...this.unknownTags],
      noDownloads: this.noDownloads,
    };
  }

  recordNoDownloads(): void {
    this.noDownloads += 1;
  }
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
  const model = m as HFModel;
  if (!isValidRowId(model.id)) return null;
  const id = (model.id as string).trim();
  const downloads = numIntCoerceNonNegative(model.downloads) ?? 0;
  const likes = numIntCoerceNonNegative(model.likes) ?? 0;
  const tags = Array.isArray(model.tags) ? model.tags.filter((t): t is string => typeof t === "string") : [];
  const licenseIds: string[] = [];
  for (const tag of tags) {
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
    task: toStringOrNull(model.pipeline_tag),
    createdAt: isoDate(model.createdAt),
    lastModified: isoDate(model.lastModified),
    tags: includeTags ? tags.slice(0, 100) : [],
  };
  return entry;
}


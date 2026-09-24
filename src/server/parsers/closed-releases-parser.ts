import { isoDate, byDateDesc, isRecord, str } from "@/server/parsers/parser-primitives";
import { upstreamConfig } from "@/server/config";
import { SOURCE_LIMITS } from "@/server/config/limits";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";

import type { ChangelogModel } from "@/server/parsers/aa/changelog-parser";
import { dedupeBy } from "@/shared/utils";

function toClosedEntry(id: unknown, model: unknown, provider: unknown, rawDate: unknown): ClosedReleaseEntry | null {
  if (typeof id !== "string" || typeof model !== "string" || typeof provider !== "string") return null;
  const cleanId = id.trim();
  const cleanModel = model.trim();
  const cleanProvider = provider.trim();
  if (!cleanId || !cleanModel || !cleanProvider) return null;
  if (cleanId.length > 500 || cleanModel.length > 500 || cleanProvider.length > 200) return null;
  if (typeof rawDate !== "string") return null;
  const date = rawDate.slice(0, 10);
  if (!isoDate(date)) return null;
  return {
    id: cleanId,
    model: cleanModel,
    provider: cleanProvider,
    releaseDate: date,
    link: `${upstreamConfig.artificialAnalysis}/models/${encodeURIComponent(cleanId)}`,
  };
}

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry | null {
  return toClosedEntry(e.releaseSlug, e.releaseName, e.creatorName, e.releaseDate);
}

function toClosedReleaseFromIndex(m: unknown): ClosedReleaseEntry | null {
  if (!isRecord(m)) return null;
  const rec = m as Partial<ArtificialAnalysisModel>;
  const slug = typeof rec.slug === "string" && rec.slug.trim() !== "" ? rec.slug : str(rec.id);
  const name = str(rec.name);
  const creator = typeof rec.model_creators?.name === "string" ? rec.model_creators.name : "Unknown";
  const date = str(rec.release_date);
  if (!slug || !name) return null;
  return toClosedEntry(slug, name, creator, date);
}

export function toClosedReleasesFromIndex(models: unknown): ClosedReleaseEntry[] {
  if (!Array.isArray(models)) return [];
  const entries = (models as ArtificialAnalysisModel[])
    .map(toClosedReleaseFromIndex)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  const deduped = dedupeBy(entries, (e) => e.id);
  deduped.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return deduped.slice(0, SOURCE_LIMITS.closedReleases);
}

export function toClosedReleases(changelog: unknown): ClosedReleaseEntry[] {
  if (!Array.isArray(changelog)) return [];
  const records = changelog.filter((e): e is ChangelogModel => isRecord(e) && typeof e.slug === "string");
  const sorted = [...records].sort(byDateDesc((e) => e.releaseDate));
  const entries = dedupeBy(sorted, (e) => e.releaseSlug)
    .map(toClosedRelease)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  return entries.slice(0, SOURCE_LIMITS.closedReleases);
}

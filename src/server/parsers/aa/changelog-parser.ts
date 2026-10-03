import { isRecord, isUnsuitableContent, str } from "@/server/parsers/parser-primitives";
import { extractNeedleJsonArrays, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scanner";
import type { ChangelogModelEntry } from "@/server/parsers/upstream-types";
import { AA_MODELS_KEY, AA_SCAN_OPTS, collectReleases, type ReleaseInfo } from "@/server/parsers/aa/release-index";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const CHANGELOG_FIELD_MAX = 500;

function isUsableField(value: string): boolean {
  return value.length <= CHANGELOG_FIELD_MAX && !isUnsuitableContent(value);
}

function collectModels(
  html: string,
  releases: Map<string, ReleaseInfo>,
): { models: ChangelogModel[]; skipped: number } {
  let best: ChangelogModel[] = [];
  let skipped = 0;
  for (const value of extractNeedleJsonArrays(html, AA_MODELS_KEY, AA_SCAN_OPTS)) {
    if (!Array.isArray(value)) continue;
    const rows = value as unknown[];
    const mapped: ChangelogModel[] = [];
    for (const raw of rows) {
      if (!isRecord(raw)) continue;
      const entry = raw as ChangelogModelEntry;
      const slug = str(entry.slug).trim();
      const name = str(entry.name).trim();
      const releaseSlug = str(entry.releaseSlug).trim();
      if (!slug || !name || !releaseSlug) continue;
      const release = releases.get(releaseSlug);
      if (!release) continue;
      if (!isUsableField(slug) || !isUsableField(name) || !isUsableField(release.name)) continue;
      mapped.push({
        slug,
        name,
        releaseSlug,
        releaseName: release.name,
        releaseDate: release.releaseDate,
        creatorName: release.creatorName,
      });
    }
    if (mapped.length > best.length) {
      best = mapped;
      skipped = rows.length - mapped.length;
    }
  }
  return { models: best, skipped };
}

export function parseChangelogModels(html: unknown): ParseResult<ChangelogModel[]> {
  if (typeof html !== "string" || !html) return parseFail("Changelog page is not a string");
  if (html.length > MAX_SCAN_CHARS) return parseFail(`Changelog page too large (${html.length} chars)`);
  const { models, skipped } = collectModels(html, collectReleases(html));
  if (models.length === 0) return parseFail("Changelog page yielded no model rows");
  return parseOk(models, skipped > 0 ? [`Skipped ${skipped} changelog rows without a usable release`] : []);
}

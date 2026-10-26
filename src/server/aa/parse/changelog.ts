import { text } from "@/server/formats/scalars";
import { isUnsuitableContent } from "@/server/formats/content-guards";
import { mapRows } from "@/server/formats/parse-rows";
import { MAX_SCAN_CHARS } from "@/server/formats/limits";
import type { ChangelogModelEntry } from "@/server/formats/wire-types";
import { scanReleaseIndex, type ReleaseInfo } from "./release-index";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";

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
  modelArrays: readonly unknown[],
  releases: Map<string, ReleaseInfo>,
): { models: ChangelogModel[]; skipped: number; sources: Set<number> } {
  let best: ChangelogModel[] = [];
  let skipped = 0;
  // Distinct row counts, not one entry per array: the RSC scan reaches the same `models` array through several windows,
  // and its repeated copies are one candidate, not a competing one.
  const sources = new Set<number>();
  for (const value of modelArrays) {
    if (!Array.isArray(value)) continue;
    const rows = value as unknown[];
    const { rows: mapped, dropped } = mapRows(rows, (raw) => {
      const entry = raw as ChangelogModelEntry;
      const slug = text(entry.slug);
      const name = text(entry.name);
      const releaseSlug = text(entry.releaseSlug);
      const release = releases.get(releaseSlug);
      if (!release) return null;
      if (!isUsableField(slug) || !isUsableField(name) || !isUsableField(release.name)) return null;
      return {
        slug,
        name,
        releaseSlug,
        releaseName: release.name,
        releaseDate: release.releaseDate,
        creatorName: release.creatorName,
      };
    });
    if (mapped.length === 0) continue;
    // Every array that yields changelog rows is recorded, not just the winner: "the longest one" is a choice between
    // candidates, and a second candidate appearing is the day that choice can start being wrong.
    sources.add(mapped.length);
    if (mapped.length > best.length) {
      best = mapped;
      skipped = dropped;
    }
  }
  return { models: best, skipped, sources };
}

export function parseChangelogModels(html: unknown): ParseResult<ChangelogModel[]> {
  // The input is the cached AA leaderboard body (see `getChangelogModels`), not a separate changelog page: the
  // changelog is derived from the same RSC payload the index is built from.
  if (typeof html !== "string" || !html) return parseFail("AA leaderboard body is not a string");
  if (html.length > MAX_SCAN_CHARS) return parseFail(`AA leaderboard body too large (${html.length} chars)`);
  const { releases, modelArrays } = scanReleaseIndex(html);
  const { models, skipped, sources } = collectModels(modelArrays, releases);
  if (models.length === 0) return parseFail("AA leaderboard body yielded no changelog rows");
  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`Skipped ${skipped} changelog rows without a usable release`);
  if (sources.size > 1) {
    const sizes = [...sources].join(", ");
    warnings.push(`Changelog rows came from ${sources.size} model arrays (${sizes}), longest wins`);
  }
  return parseOk(models, warnings);
}

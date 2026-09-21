import { isRecord, isUnsuitableContent, str } from "@/server/parsers/parser-primitives";
import { extractNeedleJsonArrays, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scanner";
import type { ChangelogRawEntry } from "@/server/parsers/upstream-types";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const MODELS_KEY = '"models"';
const CANDIDATE_PREFIX_CHARS = 256;
const SMALL_SUFFIX_CHARS = 256 * 1024 + CANDIDATE_PREFIX_CHARS;
const CANDIDATE_SUFFIX_CHARS = MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS;

function extractModelsArrays(html: string): unknown[] {
  return extractNeedleJsonArrays(html, MODELS_KEY, {
    prefixChars: CANDIDATE_PREFIX_CHARS,
    smallSuffixChars: SMALL_SUFFIX_CHARS,
    maxSuffixChars: CANDIDATE_SUFFIX_CHARS,
    unescape: true,
  });
}

function isChangelogRaw(e: unknown): e is ChangelogRawEntry {
  if (!isRecord(e)) return false;
  const r = e as ChangelogRawEntry;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecord(r.release) || !isRecord(r.creator)) return false;
  return true;
}

const CHANGELOG_FIELD_MAX = 500;

function toChangelogModel(e: ChangelogRawEntry): ChangelogModel | null {
  if (e.deprecated === true) return null;
  const release = isRecord(e.release) ? e.release : {};
  const creator = isRecord(e.creator) ? e.creator : {};
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  for (const field of [slug, name, releaseSlug, releaseName, creatorName]) {
    if (field.length > CHANGELOG_FIELD_MAX || isUnsuitableContent(field)) return null;
  }
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

export function parseChangelogModels(html: unknown): ChangelogModel[] {
  if (typeof html !== "string" || !html) return [];
  if (html.length > 8_000_000) return [];
  let best: ChangelogModel[] = [];
  for (const v of extractModelsArrays(html)) {
    if (!Array.isArray(v)) continue;
    const mapped = (v as unknown[])
      .filter(isChangelogRaw)
      .map(toChangelogModel)
      .filter((m): m is ChangelogModel => m !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}

import { isRecord, str } from "@/server/parsers/parser-primitives";
import { extractNeedleJsonArrays, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scanner";

const CANDIDATE_PREFIX_CHARS = 256;

export const AA_MODELS_KEY = '"models"';
const AA_RELEASES_KEY = '"releases"';

export const AA_SCAN_OPTS = {
  prefixChars: CANDIDATE_PREFIX_CHARS,
  smallSuffixChars: 256 * 1024 + CANDIDATE_PREFIX_CHARS,
  maxSuffixChars: MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS,
  unescape: true,
};

export interface ReleaseInfo {
  name: string;
  releaseDate: string;
  creatorName: string;
  creatorColor: string;
}

function releaseInfo(raw: unknown): { slug: string; info: ReleaseInfo } | null {
  if (!isRecord(raw) || raw.deprecated === true) return null;
  const slug = str(raw.slug).trim();
  const name = str(raw.name).trim();
  const releaseDate = str(raw.releaseDate).trim();
  const creator = isRecord(raw.creator) ? raw.creator : undefined;
  const creatorName = creator ? str(creator.name).trim() : "";
  if (!slug || !name || !releaseDate || !creatorName) return null;
  return {
    slug,
    info: { name, releaseDate, creatorName, creatorColor: creator ? str(creator.color).trim() : "" },
  };
}

export function collectReleases(html: string): Map<string, ReleaseInfo> {
  const releases = new Map<string, ReleaseInfo>();
  for (const value of extractNeedleJsonArrays(html, AA_RELEASES_KEY, AA_SCAN_OPTS)) {
    if (!Array.isArray(value)) continue;
    for (const raw of value as unknown[]) {
      const entry = releaseInfo(raw);
      if (!entry || releases.has(entry.slug)) continue;
      releases.set(entry.slug, entry.info);
    }
  }
  return releases;
}

export function collectModelReleaseLinksFromArrays(arrays: readonly unknown[]): Map<string, string> {
  const links = new Map<string, string>();
  for (const value of arrays) {
    if (!Array.isArray(value)) continue;
    const rows = value as unknown[];
    if (rows.length === 0 || !isRecord(rows[0]) || !("releaseSlug" in rows[0])) continue;
    for (const raw of rows) {
      if (!isRecord(raw)) continue;
      const slug = str(raw.slug).trim();
      const releaseSlug = str(raw.releaseSlug).trim();
      if (!slug || !releaseSlug || links.has(slug)) continue;
      links.set(slug, releaseSlug);
    }
  }
  return links;
}

export function collectModelReleaseLinks(html: string): Map<string, string> {
  return collectModelReleaseLinksFromArrays(extractNeedleJsonArrays(html, AA_MODELS_KEY, AA_SCAN_OPTS));
}

import { isRecord, str } from "@/server/formats/parser-primitives";
import { extractNeedleJsonArrays } from "@/server/formats/rsc-needle";
import { MAX_SCAN_CHARS } from "@/server/formats/limits";
import { fnv1aHash } from "@/server/util/hash";

const CANDIDATE_PREFIX_CHARS = 256;

const AA_MODELS_KEY = '"models"';
const AA_RELEASES_KEY = '"releases"';

const AA_SCAN_OPTS = {
  prefixChars: CANDIDATE_PREFIX_CHARS,
  smallSuffixChars: 256 * 1024 + CANDIDATE_PREFIX_CHARS,
  maxSuffixChars: MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS,
  unescape: true,
};

export interface ReleaseInfo {
  name: string;
  releaseDate: string;
  creatorName: string;
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
    info: { name, releaseDate, creatorName },
  };
}

function collectReleases(html: string): Map<string, ReleaseInfo> {
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

interface ReleaseIndexScan {
  releases: Map<string, ReleaseInfo>;
  modelArrays: unknown[];
}

let cachedFingerprint = "";
let cachedScan: ReleaseIndexScan | null = null;

export function scanReleaseIndex(html: string): ReleaseIndexScan {
  // Memo on a fingerprint: retaining the multi-MB payload doubled the isolate's footprint.
  const fingerprint = `${html.length}:${fnv1aHash(html)}`;
  if (cachedScan && cachedFingerprint === fingerprint) return cachedScan;
  const scan: ReleaseIndexScan = {
    releases: collectReleases(html),
    modelArrays: extractNeedleJsonArrays(html, AA_MODELS_KEY, AA_SCAN_OPTS),
  };
  cachedFingerprint = fingerprint;
  cachedScan = scan;
  return scan;
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

import { isRecord, str } from "@/server/formats/scalars";
import { extractNeedleJsonArrays } from "@/server/formats/rsc-scan";
import { MAX_RSC_BYTES } from "@/server/formats/limits";
import { L1_TTL_CAP_MS } from "@/server/cache/config";

const CANDIDATE_PREFIX_CHARS = 256;

const AA_MODELS_KEY = '"models"';
const AA_RELEASES_KEY = '"releases"';

const AA_SCAN_OPTS = {
  prefixChars: CANDIDATE_PREFIX_CHARS,
  smallSuffixChars: 256 * 1024 + CANDIDATE_PREFIX_CHARS,
  // Only has to cover a body the transport already caps at MAX_RSC_BYTES: a wider window cannot see more.
  maxSuffixChars: MAX_RSC_BYTES + CANDIDATE_PREFIX_CHARS,
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

/**
 * How long an idle scan stays memoized. The leaderboard and changelog parsers both receive the same cached body string,
 * and L1 hands that one instance back for as long as it holds the entry — never longer than `L1_TTL_CAP_MS`. Retention is
 * capped on purpose: the identity comparison is what keeps the body alive, so a memo with no expiry would pin a
 * superseded multi-MB payload in the isolate for as long as the isolate lives.
 */
const SCAN_MEMO_IDLE_MS = L1_TTL_CAP_MS;

let cachedHtml: string | null = null;
let cachedScan: ReleaseIndexScan | null = null;
let cachedScanAt = 0;

export function scanReleaseIndex(html: string): ReleaseIndexScan {
  // Identity, not a content hash: the leaderboard and changelog parsers both receive the same cached body string, so
  // this hits, while `fnv1aHash(html)` walked the whole multi-MB body on every call and a 32-bit collision could have
  // answered with another body's releases.
  const now = Date.now();
  if (cachedScan !== null && cachedHtml === html && now - cachedScanAt < SCAN_MEMO_IDLE_MS) return cachedScan;
  const scan: ReleaseIndexScan = {
    releases: collectReleases(html),
    modelArrays: extractNeedleJsonArrays(html, AA_MODELS_KEY, AA_SCAN_OPTS),
  };
  // One slot, overwritten: the memo never holds more than the body it was last asked about.
  cachedHtml = html;
  cachedScan = scan;
  cachedScanAt = now;
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

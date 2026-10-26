import { isRecord, text } from "@/server/formats/scalars";
import { extractNeedleJsonArrays, type NeedleScanStats } from "@/server/formats/rsc-scan";
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
};

export interface ReleaseInfo {
  name: string;
  releaseDate: string;
  creatorName: string;
}

function releaseInfo(raw: unknown): { slug: string; info: ReleaseInfo } | null {
  if (!isRecord(raw) || raw.deprecated === true) return null;
  const slug = text(raw.slug);
  const name = text(raw.name);
  const releaseDate = text(raw.releaseDate);
  const creator = isRecord(raw.creator) ? raw.creator : undefined;
  const creatorName = creator ? text(creator.name) : "";
  if (!slug || !name || !releaseDate || !creatorName) return null;
  return {
    slug,
    info: { name, releaseDate, creatorName },
  };
}

function collectReleases(html: string, stats: NeedleScanStats): Map<string, ReleaseInfo> {
  const releases = new Map<string, ReleaseInfo>();
  for (const value of extractNeedleJsonArrays(html, AA_RELEASES_KEY, AA_SCAN_OPTS, stats)) {
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
  /**
   * Slices this scan could not parse. A non-zero count is reported by the caller that logs; it is not a parse failure,
   * because the arrays that did parse are the ones the ranking needs and one bad slice must not fail the whole body.
   */
  unparsableSlices: number;
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
  const stats: NeedleScanStats = { unparsableSlices: 0 };
  const scan: ReleaseIndexScan = {
    releases: collectReleases(html, stats),
    modelArrays: extractNeedleJsonArrays(html, AA_MODELS_KEY, AA_SCAN_OPTS, stats),
    unparsableSlices: stats.unparsableSlices,
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
    // Whether this array is the model array is decided by *any* row carrying a `releaseSlug`, not by the first one: a
    // placeholder or deprecated entry ahead of the rest used to make the whole array look like something else, and the
    // index then answered every model with no release date — a missing field, not an error.
    if (!rows.some((row) => isRecord(row) && "releaseSlug" in row)) continue;
    for (const raw of rows) {
      if (!isRecord(raw)) continue;
      const slug = text(raw.slug);
      const releaseSlug = text(raw.releaseSlug);
      if (!slug || !releaseSlug || links.has(slug)) continue;
      links.set(slug, releaseSlug);
    }
  }
  return links;
}

import { isRecord, text } from "@/server/formats/scalars";
import { extractNeedleJsonArrays, type NeedleScanStats } from "@/server/formats/rsc-scan";
import { MAX_RSC_BYTES } from "@/server/formats/limits";
import { L1_TTL_CAP_MS } from "@/server/cache/config";
import type { AaChangelogRow, AaReleaseRow } from "../wire";
import { hasReleaseLink } from "../wire-read";

const CANDIDATE_PREFIX_CHARS = 256;

const AA_MODELS_KEY = '"models"';
const AA_RELEASES_KEY = '"releases"';

const AA_SCAN_OPTS = {
  prefixChars: CANDIDATE_PREFIX_CHARS,
  smallSuffixChars: 256 * 1024 + CANDIDATE_PREFIX_CHARS,
  // Only has to cover a body the transport already caps at MAX_RSC_BYTES: a wider window cannot see more.
  maxSuffixChars: MAX_RSC_BYTES + CANDIDATE_PREFIX_CHARS,
};

/** The row arrays among one needle scan's slices, and nothing else: a slice the scan could not parse arrives as something other than an array. */
export function* rowArrays(slices: readonly unknown[]): Generator<unknown[]> {
  for (const slice of slices) {
    if (Array.isArray(slice)) yield slice as unknown[];
  }
}

export interface ReleaseInfo {
  name: string;
  releaseDate: string;
  creatorName: string;
}

function releaseInfo(raw: unknown): { slug: string; info: ReleaseInfo } | null {
  if (!isRecord(raw)) return null;
  const row: AaReleaseRow = raw;
  if (row.deprecated === true) return null;
  const slug = text(row.slug);
  const name = text(row.name);
  const releaseDate = text(row.releaseDate);
  const creator = isRecord(row.creator) ? row.creator : undefined;
  const creatorName = creator ? text(creator.name) : "";
  if (!slug || !name || !releaseDate || !creatorName) return null;
  return {
    slug,
    info: { name, releaseDate, creatorName },
  };
}

function collectReleases(html: string, stats: NeedleScanStats): Map<string, ReleaseInfo> {
  const releases = new Map<string, ReleaseInfo>();
  for (const rows of rowArrays(extractNeedleJsonArrays(html, AA_RELEASES_KEY, AA_SCAN_OPTS, stats))) {
    for (const raw of rows) {
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
   * Slices this scan could not parse; a non-zero count is reported by the caller that logs, and one bad slice must not
   * fail the whole body.
   */
  unparsableSlices: number;
}

/** How long an idle scan stays memoized. Both parsers receive the same cached body string, which L1 hands back for as long as it holds the entry (never past `L1_TTL_CAP_MS`): the identity comparison keeps the body alive, so a memo with no expiry would pin a superseded multi-MB payload for the isolate's lifetime. */
const SCAN_MEMO_IDLE_MS = L1_TTL_CAP_MS;

let cachedHtml: string | null = null;
let cachedScan: ReleaseIndexScan | null = null;
let cachedScanAt = 0;

export function scanReleaseIndex(html: string): ReleaseIndexScan {
  // Identity, not a content hash: both parsers receive the same cached body string, and `fnv1aHash(html)` walked the whole
  // multi-MB body on every call with a 32-bit collision risk.
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
  for (const rows of rowArrays(arrays)) {
    // Whether this is the model array is decided by *any* row carrying a `releaseSlug`, not by the first one: a placeholder
    // or deprecated entry ahead of the rest would make the whole array look like something else.
    if (!rows.some((row) => isRecord(row) && hasReleaseLink(row))) continue;
    for (const raw of rows) {
      if (!isRecord(raw)) continue;
      const row: AaChangelogRow = raw;
      const slug = text(row.slug);
      const releaseSlug = text(row.releaseSlug);
      if (!slug || !releaseSlug || links.has(slug)) continue;
      links.set(slug, releaseSlug);
    }
  }
  return links;
}

import type { AppContext } from "@/server/context";
import { SOURCE_LIMITS, STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/server/config";
import { UpstreamError } from "@/server/infra/errors";
import { MAX_SCAN_CHARS } from "@/server/parsers/rsc";
import { balancedJsonEnd } from "@/server/parsers/rsc-scan";
import { isRecord, str } from "@/server/parsers/primitives";

const CHANGELOG_PATH = "/changelog";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const MODELS_NEEDLE_RE = /\\?"models\\?"\s*:/g;
const MODELS_KEY = '"models"';
const CANDIDATE_PREFIX_CHARS = 256;
// Two-stage windows: try a small one first (typical payloads), fall back to
// the full 8MB scan window only when the array does not close inside it.
const SMALL_SUFFIX_CHARS = 256 * 1024 + CANDIDATE_PREFIX_CHARS;
const CANDIDATE_SUFFIX_CHARS = MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS;

function unescapeWindow(window: string): string {
  // Skip the regex pass entirely when the window has no escapes at all
  // (the common case for non-embedded payloads).
  if (!window.includes("\\")) return window;
  return window.replace(/\\(.)/g, (m, c: string) => (c === '"' ? '"' : c === "\\" ? "\\" : m));
}

function parseModelsArrayAt(window: string, d: number, found: unknown[]): boolean {
  const end = balancedJsonEnd(window, d, MAX_SCAN_CHARS);
  if (end === -1) return false;
  try {
    found.push(JSON.parse(window.slice(d, end)));
    return true;
  } catch {
    return false;
  }
}

function tryExtractWindow(html: string, start: number, end: number, found: unknown[]): boolean {
  const window = unescapeWindow(html.slice(start, Math.min(html.length, end)));
  // Try every `"models"` occurrence inside the window, not just the first:
  // decoy keys (non-array values) may precede the real payload, and a
  // first-hit-only scan would bail before reaching it.
  let at = window.indexOf(MODELS_KEY);
  if (at === -1) return false;
  let parsed = false;
  while (at !== -1) {
    let c = at + MODELS_KEY.length;
    while (c < window.length && /\s/.test(window[c]!)) c++;
    if (window[c] === ":") {
      c++;
      while (c < window.length && /\s/.test(window[c]!)) c++;
      if (window[c] === "[" && parseModelsArrayAt(window, c, found)) parsed = true;
    }
    at = window.indexOf(MODELS_KEY, at + MODELS_KEY.length);
  }
  return parsed;
}

function extractModelsArrays(html: string): unknown[] {
  const found: unknown[] = [];
  MODELS_NEEDLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MODELS_NEEDLE_RE.exec(html)) !== null) {
    // Cheap raw-text reject: in both plain and flight-escaped forms the array
    // bracket is never escaped, so a non-`[` value can be skipped before any
    // window slicing/unescaping. `"models":"x"` or `"models":5` is ignored.
    let c = match.index + match[0].length;
    while (c < html.length && /\s/.test(html[c]!)) c++;
    if (html[c] !== "[") continue;
    const start = Math.max(0, match.index - CANDIDATE_PREFIX_CHARS);
    // Small window first (unescape cost is proportional to window size);
    // fall back to the full window when the array overflows or fails to parse.
    if (!tryExtractWindow(html, start, match.index + SMALL_SUFFIX_CHARS, found)) {
      tryExtractWindow(html, start, match.index + CANDIDATE_SUFFIX_CHARS, found);
    }
    // Advance past this match unconditionally so a failed window parse can
    // never leave the scanner stuck re-reading the same needle position.
    MODELS_NEEDLE_RE.lastIndex = match.index + Math.max(1, match[0].length);
  }
  return found;
}

function isChangelogRaw(e: unknown): e is Record<string, unknown> {
  if (!isRecord(e)) return false;
  const r = e as Record<string, unknown>;
  // Reject arrays: a repeated <creator>/<release> element in the payload
  // parses as an array, and str() on it would yield "" silently downstream.
  if (Array.isArray(r.slug) || Array.isArray(r.name) || Array.isArray(r.releaseDate)) return false;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecord(r.release) || !isRecord(r.creator)) return false;
  return true;
}

function toChangelogModel(e: Record<string, unknown>): ChangelogModel | null {
  const release = e.release as Record<string, unknown>;
  const creator = e.creator as Record<string, unknown>;
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

export function parseChangelogModels(html: string): ChangelogModel[] {
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

export async function fetchChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const html = await ctx.http.text(
    `${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`,
    {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...UPSTREAM_FETCH_OPTS,
    },
    MAX_FEED_BYTES,
  );
  const models = parseChangelogModels(html);
  if (models.length === 0) {
    throw new UpstreamError(
      `AA changelog yielded 0 models (raw=1 page, kept=0, markup changed?, body=${html.length}B)`,
    );
  }
  // The embedded payload is a catalog snapshot, not date-ordered: sort newest
  // first so the cap keeps the recent window instead of an arbitrary head.
  return models
    .sort((a, b) => {
      const ta = Date.parse(a.releaseDate);
      const tb = Date.parse(b.releaseDate);
      const na = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
      const nb = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
      return nb - na;
    })
    .slice(0, SOURCE_LIMITS.changelog);
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return ctx.cache.withTtl(cacheKeys.changelog, STATIC_TTL_MS, async () => {
    return { data: await fetchChangelogModels(ctx) };
  });
}

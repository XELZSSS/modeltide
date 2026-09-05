// Unified data-source filter: single place for all dirty / invalid / unsuitable
// content filtering. Every `src/server/sources/*` + feed parser must delegate
// row-level keep/drop decisions here instead of inline `if (!id) return null`
// style checks, so filtering rules stay consistent across upstreams.

import { dedupeBy } from "@/shared/utils";

// ---------------------------------------------------------------------------
// 0. Generic dirty / unsuitable content
// ---------------------------------------------------------------------------

/** Exact-match placeholders that never denote real content. */
const PLACEHOLDER_TEXTS = new Set([
  "-",
  "--",
  "—",
  "–",
  "···",
  "...",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "tbd",
  "todo",
  "test",
]);

/** Spam / adult / gambling / injection signals (word-boundary matched). */
const UNSUITABLE_RE =
  /\b(casino|porn|xxx|viagra|gambling|betting|lottery|payday[-_ ]?loan|free[-_ ]?money)\b|赌场|赌博|六合彩|色情|javascript:|vbscript:|<script|data:text\/html/i;

/** Entire string is one repeated char (4+), e.g. "...." / "xxxx". */
const REPEATED_CHAR_RE = /^(.)\1{3,}$/s;

/** Non-empty trimmed string. */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** True for exact placeholder tokens (case-insensitive, trimmed). */
export function isPlaceholderText(t: string): boolean {
  return PLACEHOLDER_TEXTS.has(t.trim().toLowerCase());
}

/**
 * True when a text fragment is unsuitable: placeholder, injection, spam, or
 * a repeated-char filler. Conservative by design — single chars ("A") and
 * long titles ("Axxx...") are kept; only whole-token / word-boundary hits drop.
 */
export function isUnsuitableContent(t: string): boolean {
  const trimmed = t.trim();
  if (!trimmed) return true;
  if (isPlaceholderText(trimmed)) return true;
  if (REPEATED_CHAR_RE.test(trimmed)) return true;
  // Control chars (except tab/newline) indicate binary/garbage payloads.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) return true;
  if (UNSUITABLE_RE.test(trimmed)) return true;
  return false;
}

/**
 * Trim + reject empty / placeholder / unsuitable text. Returns null when the
 * value must be dropped. Optional maxLen truncates (not rejects) long input.
 */
export function cleanText(v: unknown, maxLen?: number): string | null {
  if (typeof v !== "string") return null;
  let t = v.trim();
  if (!t) return null;
  if (isUnsuitableContent(t)) return null;
  if (maxLen != null && t.length > maxLen) t = t.slice(0, maxLen).trim();
  return t || null;
}

/** http(s) URL only — filters javascript:, data:, relative and garbage links. */
export function isValidHttpUrl(link: string): boolean {
  const t = link.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Identity / slug
// ---------------------------------------------------------------------------

/** Raw id check shared by HF / OpenRouter / AA directory rows. */
export function isValidRowId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const t = id.trim();
  if (!t || t.length > 500) return false;
  if (isUnsuitableContent(t)) return false;
  return true;
}

/** Catalog rows must carry a usable slug + display name. */
export function hasCatalogIdentity(m: { slug?: unknown; name?: unknown }): boolean {
  if (!isNonEmptyString(m.slug) || !isNonEmptyString(m.name)) return false;
  if (isUnsuitableContent(m.slug) || isUnsuitableContent(m.name)) return false;
  return true;
}

/** Public model identity: id + slug + name all usable. */
export function isValidModelIdentity(id: unknown, slug: unknown, name: unknown): boolean {
  if (!isNonEmptyString(id) || !isNonEmptyString(slug) || !isNonEmptyString(name)) return false;
  if (isUnsuitableContent(id) || isUnsuitableContent(slug) || isUnsuitableContent(name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 2. Numbers / ranks / pricing
// ---------------------------------------------------------------------------

/** Rank cells: integer >= 0 (Arena allows 0 during live reshuffles). */
export function isValidRankNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** T2I rank: strictly positive (rank 0 / missing means unranked). */
export function isValidTextToImageRank(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/** Pricing legs need finite non-negative numbers; both missing = unusable. */
export function isUsablePricing(input: number | null | undefined, output: number | null | undefined): boolean {
  if (input == null && output == null) return false;
  if (input != null && (!Number.isFinite(input) || input < 0)) return false;
  if (output != null && (!Number.isFinite(output) || output < 0)) return false;
  return true;
}

/** OpenRouter directory legs: both legs required and non-negative. */
export function isUsableOpenRouterPricing(prompt: number, completion: number): boolean {
  if (!Number.isFinite(prompt) || prompt < 0) return false;
  if (!Number.isFinite(completion) || completion < 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 3. Artificial Analysis
// ---------------------------------------------------------------------------

export function isValidTextToImageEntry(entry: {
  id: unknown;
  slug: unknown;
  name: unknown;
  rank: number | null | undefined;
  elo: number | null | undefined;
}): boolean {
  if (!isValidModelIdentity(entry.id, entry.slug, entry.name)) return false;
  if (!isValidTextToImageRank(entry.rank)) return false;
  if (entry.elo == null || !Number.isFinite(entry.elo)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 4. OpenRouter
// ---------------------------------------------------------------------------

/** Rankings rows need a usable permaslug. */
export function isValidOpenRouterRowId(permaslug: unknown): boolean {
  return isValidRowId(permaslug);
}

/** Directory rows need an id plus a pricing block. */
export function isValidOpenRouterDirectoryRow(m: { id?: unknown; pricing?: unknown }): boolean {
  if (!isValidRowId(m.id)) return false;
  if (m.pricing == null || typeof m.pricing !== "object") return false;
  return true;
}

// ---------------------------------------------------------------------------
// 5. Hugging Face
// ---------------------------------------------------------------------------

export function isValidHuggingFaceId(id: unknown): boolean {
  return isValidRowId(id);
}

/** Rankings drop zero-download placeholders / stub entries. */
export function keepOpenSourceRanking(m: { downloads: number }): boolean {
  return Number.isFinite(m.downloads) && m.downloads > 0;
}

/** Releases need an open license and a real creation date. */
export function isOpenReleaseEntry(m: { license: string | null; createdAt: string | null }): boolean {
  if (m.license == null) return false;
  if (m.createdAt == null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 6. Arena
// ---------------------------------------------------------------------------

/** Arena data rows: enough cells + valid rank + usable id. */
export function isValidArenaRow(cells: string[], rank: number | null, id: string): boolean {
  if (cells.length < 4) return false;
  if (!isValidRankNumber(rank)) return false;
  if (!id.trim()) return false;
  if (isUnsuitableContent(id)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 7. News / feeds
// ---------------------------------------------------------------------------

const MAX_NEWS_TITLE_CHARS = 300;

/** News items need a suitable title and an http(s) link. */
export function isSuitableNewsItem(title: unknown, link: unknown): boolean {
  if (typeof title !== "string" || typeof link !== "string") return false;
  const t = title.trim();
  const l = link.trim();
  if (!t || !l) return false;
  if (t.length > MAX_NEWS_TITLE_CHARS + 200) return false;
  if (isUnsuitableContent(t)) return false;
  if (!isValidHttpUrl(l)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 8. Official pricing
// ---------------------------------------------------------------------------

/** Header rows ("Model") carry no rates. */
export function shouldSkipPricingHeader(rawName: string): boolean {
  const t = rawName.trim();
  if (!t) return true;
  if (/^model$/i.test(t)) return true;
  if (isUnsuitableContent(t)) return true;
  return false;
}

/** Retired models stay listed for reference; they are not purchasable. */
export function isRetiredRow(cell: string): boolean {
  return /retired/i.test(cell);
}

/** Kimi highspeed variants and non-per-1M rows are unrelated to this feed. */
export function shouldSkipKimiRow(id: string, unit: string): boolean {
  if (!/^kimi-/i.test(id)) return true;
  if (/highspeed/i.test(id)) return true;
  if (!/1M/i.test(unit)) return true;
  if (isUnsuitableContent(id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 9. Generic pipeline: map + drop nulls + dedupe by key
// ---------------------------------------------------------------------------

/**
 * Map rows, drop nulls (dirty/invalid), dedupe by key keeping the first.
 * Replaces the repeated `.map(...).filter(nonNull)` + `dedupeBy` chains.
 */
export function filterMapDedupe<T, R>(items: T[], mapFn: (item: T) => R | null, keyFn: (item: R) => string | null | undefined): R[] {
  return dedupeBy(
    items.map(mapFn).filter((m): m is R => m !== null),
    keyFn,
  );
}

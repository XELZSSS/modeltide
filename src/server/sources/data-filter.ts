import { dedupeBy } from "@/shared/utils";

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

const UNSUITABLE_RE =
  /\b(casino|porn|xxx|viagra|gambling|betting|lottery|payday[-_ ]?loan|free[-_ ]?money)\b|赌场|赌博|六合彩|色情|javascript:|vbscript:|<script|data:text\/html/i;

const NEWS_TITLE_BAD_RE = /javascript:|vbscript:|<script|data:text\/html|赌场|六合彩/i;

const ID_BAD_RE = /javascript:|vbscript:|<script|data:text\/html/i;

const REPEATED_CHAR_RE = /^(.)\1{3,}$/s;
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function hasGarbageChars(t: string): boolean {
  return REPEATED_CHAR_RE.test(t) || CONTROL_CHARS_RE.test(t);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlaceholderText(t: string): boolean {
  return PLACEHOLDER_TEXTS.has(t.trim().toLowerCase());
}

export function isUnsuitableContent(t: string): boolean {
  const trimmed = t.trim();
  if (!trimmed) return true;
  if (isPlaceholderText(trimmed)) return true;
  if (hasGarbageChars(trimmed)) return true;
  if (UNSUITABLE_RE.test(trimmed)) return true;
  return false;
}

function isValidHttpUrl(link: string): boolean {
  const t = link.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidRowId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const t = id.trim();
  if (!t || t.length > 500) return false;
  if (isPlaceholderText(t) || hasGarbageChars(t)) return false;
  if (ID_BAD_RE.test(t)) return false;
  return true;
}

export function hasCatalogIdentity(m: { slug?: unknown; name?: unknown }): boolean {
  if (!isNonEmptyString(m.slug) || !isNonEmptyString(m.name)) return false;
  if (isUnsuitableContent(m.slug) || isUnsuitableContent(m.name)) return false;
  return true;
}

export function isValidModelIdentity(id: unknown, slug: unknown, name: unknown): boolean {
  if (!isNonEmptyString(id) || !isNonEmptyString(slug) || !isNonEmptyString(name)) return false;
  if (isUnsuitableContent(id) || isUnsuitableContent(slug) || isUnsuitableContent(name)) return false;
  return true;
}

function isValidTextToImageRank(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

export function isUsablePricing(input: number | null | undefined, output: number | null | undefined): boolean {
  if (input == null && output == null) return false;
  if (input != null && (!Number.isFinite(input) || input < 0)) return false;
  if (output != null && (!Number.isFinite(output) || output < 0)) return false;
  return true;
}

export function isUsableOpenRouterPricing(input: number, output: number): boolean {
  if (!Number.isFinite(input) || input < 0) return false;
  if (!Number.isFinite(output) || output < 0) return false;
  return true;
}

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

export function isValidOpenRouterRowId(permaslug: unknown): boolean {
  return isValidRowId(permaslug);
}

export function isValidOpenRouterDirectoryRow(m: { id?: unknown; pricing?: unknown }): boolean {
  if (!isValidRowId(m.id)) return false;
  if (m.pricing == null || typeof m.pricing !== "object") return false;
  return true;
}

export function isValidHuggingFaceId(id: unknown): boolean {
  return isValidRowId(id);
}

export function keepOpenSourceRanking(m: { downloads: number }): boolean {
  return Number.isFinite(m.downloads) && m.downloads > 0;
}

export function isOpenReleaseEntry(m: { license: string | null; createdAt: string | null }): boolean {
  if (m.license == null) return false;
  if (m.createdAt == null) return false;
  return true;
}

const MAX_NEWS_TITLE_CHARS = 300;

export function isSuitableNewsItem(title: unknown, link: unknown): boolean {
  if (typeof title !== "string" || typeof link !== "string") return false;
  const t = title.trim();
  const l = link.trim();
  if (!t || !l) return false;
  if (t.length > MAX_NEWS_TITLE_CHARS + 200) return false;
  if (isPlaceholderText(t) || hasGarbageChars(t)) return false;
  if (NEWS_TITLE_BAD_RE.test(t)) return false;
  if (!isValidHttpUrl(l)) return false;
  return true;
}

export function filterMapDedupe<T, R>(
  items: T[],
  mapFn: (item: T) => R | null,
  keyFn: (item: R) => string | null | undefined,
  compare?: (a: R, b: R) => number,
): R[] {
  const mapped = items.map(mapFn).filter((m): m is R => m !== null);
  return dedupeBy(compare ? [...mapped].sort(compare) : mapped, keyFn);
}

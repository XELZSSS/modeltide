import { MAX_ID_CHARS } from "@/shared/config";
import { isHttpUrl } from "@/shared/utils/url";
import { isRecord } from "./scalars";

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

const XSS_BAD_SRC = String.raw`javascript:|vbscript:|<script|data:text\/html`;

const UNSUITABLE_RE = new RegExp(
  String.raw`\b(casino|porn|xxx|viagra|gambling|betting|lottery|payday[-_ ]?loan|free[-_ ]?money)\b|赌场|赌博|六合彩|色情|` +
    XSS_BAD_SRC,
  "i",
);

const NEWS_TITLE_BAD_RE = new RegExp(`${XSS_BAD_SRC}|赌场|六合彩`, "i");

const ID_BAD_RE = new RegExp(XSS_BAD_SRC, "i");

const REPEATED_CHAR_RE = /^(.)\1{3,}$/s;
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function hasGarbageChars(t: string): boolean {
  return REPEATED_CHAR_RE.test(t) || CONTROL_CHARS_RE.test(t);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * `PLACEHOLDER_TEXTS` holds only short words, so the lowercase copy is skipped past the longest of them. The length
 * bound is derived from the set instead of hardcoded: a longer placeholder added later would otherwise be silently
 * unreachable behind this guard.
 */
const MAX_PLACEHOLDER_CHARS = Math.max(...[...PLACEHOLDER_TEXTS].map((t) => t.length));

function isPlaceholderText(t: string): boolean {
  if (t.length > MAX_PLACEHOLDER_CHARS) return false;
  return PLACEHOLDER_TEXTS.has(t.toLowerCase());
}

function isJunkText(t: string): boolean {
  return isPlaceholderText(t) || hasGarbageChars(t);
}

export function isUnsuitableContent(t: string): boolean {
  const trimmed = t.trim();
  return !trimmed || isJunkText(trimmed) || UNSUITABLE_RE.test(trimmed);
}

export function isValidRowId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const t = id.trim();
  return t.length > 0 && t.length <= MAX_ID_CHARS && !isJunkText(t) && !ID_BAD_RE.test(t);
}

export function hasCatalogIdentity(m: unknown): boolean {
  if (!isRecord(m)) return false;
  const { slug, name } = m;
  return isNonEmptyString(slug) && isNonEmptyString(name);
}

export function isValidModelIdentity(id: unknown, slug: unknown, name: unknown): boolean {
  return isNonEmptyString(id) && isNonEmptyString(slug) && isNonEmptyString(name);
}

export function isValidOpenRouterDirectoryRow(m: unknown): boolean {
  return isRecord(m) && isValidRowId(m.id) && m.pricing != null && typeof m.pricing === "object";
}

export const MAX_NEWS_TITLE_CHARS = 300;

export function isSuitableNewsItem(title: unknown, link: unknown): boolean {
  if (typeof title !== "string" || typeof link !== "string") return false;
  const t = title.trim();
  const l = link.trim();
  if (!t || !l) return false;
  return !isJunkText(t) && !NEWS_TITLE_BAD_RE.test(t) && isHttpUrl(l);
}

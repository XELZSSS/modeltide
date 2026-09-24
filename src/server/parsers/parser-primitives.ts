import { isFiniteNumber, toStringOrNull } from "@/shared/utils";
import { isHttpUrl } from "@/shared/utils/url";

export const num = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

export const numCoerce = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const numOr = (v: unknown, fallback = 0): number => numCoerce(v) ?? fallback;

export const numCoerceNonNegative = (v: unknown): number | null => {
  const n = numCoerce(v);
  return n != null && n >= 0 ? n : null;
};

const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\S*)?$/;
export const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || !ISO_LIKE_RE.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  const datePart = trimmed.slice(0, 10);
  const normalized = new Date(`${datePart}T00:00:00Z`).toISOString().slice(0, 10);
  if (normalized !== datePart) return null;
  return trimmed;
};

export const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const strOr = (v: unknown): string | null | undefined => (v == null ? v : typeof v === "string" ? v : undefined);
export const strOrNull = toStringOrNull;
export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
export const isRecord = (v: unknown): v is Record<string, unknown> => obj(v) !== undefined;

export const numIntCoerceNonNegative = (v: unknown): number | null => {
  const n = numCoerceNonNegative(v);
  return n == null ? null : Math.trunc(n);
};

export const titleCase = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

export function truncateSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = max - 1;
  const c = s.charCodeAt(cut);
  return c >= 0xd800 && c <= 0xdbff ? s.slice(0, cut) : s.slice(0, max);
}

export function parseTs(v: unknown, positiveOnly = false): number {
  if (typeof v !== "string") return Number.NEGATIVE_INFINITY;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || (positiveOnly && t <= 0)) return Number.NEGATIVE_INFINITY;
  return t;
}

export function byDateDesc<T>(getDate: (item: T) => unknown): (a: T, b: T) => number {
  const parsed = new Map<T, number>();
  const tsOf = (item: T): number => {
    const cached = parsed.get(item);
    if (cached !== undefined) return cached;
    const ts = parseTs(getDate(item));
    parsed.set(item, ts);
    return ts;
  };
  return (a, b) => {
    const ta = tsOf(a);
    const tb = tsOf(b);
    return ta === tb ? 0 : tb - ta;
  };
}

export function byNumberDesc<T>(score: (item: T) => number | null | undefined): (a: T, b: T) => number {
  return (a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa == null && sb == null) return 0;
    return (sb ?? Number.NEGATIVE_INFINITY) - (sa ?? Number.NEGATIVE_INFINITY);
  };
}

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

export function isValidRowId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const t = id.trim();
  if (!t || t.length > 500) return false;
  if (isPlaceholderText(t) || hasGarbageChars(t)) return false;
  if (ID_BAD_RE.test(t)) return false;
  return true;
}

export function hasCatalogIdentity(m: unknown): boolean {
  if (!isRecord(m)) return false;
  if (!isNonEmptyString(m.slug) || !isNonEmptyString(m.name)) return false;
  if (isUnsuitableContent(m.slug as string) || isUnsuitableContent(m.name as string)) return false;
  return true;
}

export function isValidModelIdentity(id: unknown, slug: unknown, name: unknown): boolean {
  if (!isNonEmptyString(id) || !isNonEmptyString(slug) || !isNonEmptyString(name)) return false;
  if (isUnsuitableContent(id) || isUnsuitableContent(slug) || isUnsuitableContent(name)) return false;
  return true;
}

export function isValidTextToImageEntry(entry: {
  id: unknown;
  slug: unknown;
  name: unknown;
  elo: number | null | undefined;
}): boolean {
  if (!isValidModelIdentity(entry.id, entry.slug, entry.name)) return false;
  if (entry.elo == null || !Number.isFinite(entry.elo)) return false;
  return true;
}

export function isValidOpenRouterDirectoryRow(m: unknown): boolean {
  if (!isRecord(m)) return false;
  if (!isValidRowId(m.id)) return false;
  if (m.pricing == null || typeof m.pricing !== "object") return false;
  return true;
}

const MAX_NEWS_TITLE_CHARS = 300;
const MAX_NEWS_TITLE_INPUT_CHARS = MAX_NEWS_TITLE_CHARS + 200;

export function isSuitableNewsItem(title: unknown, link: unknown): boolean {
  if (typeof title !== "string" || typeof link !== "string") return false;
  const t = title.trim();
  const l = link.trim();
  if (!t || !l) return false;
  if (t.length > MAX_NEWS_TITLE_INPUT_CHARS) return false;
  if (isPlaceholderText(t) || hasGarbageChars(t)) return false;
  if (NEWS_TITLE_BAD_RE.test(t)) return false;
  if (!isHttpUrl(l)) return false;
  return true;
}

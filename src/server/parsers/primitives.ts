export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toNumberFallback(v: unknown, fallback: number): number {
  try {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return fallback;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : fallback;
    }
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    if (typeof v === "bigint") {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  } catch {
    // Number(Symbol()) throws TypeError — treat as unparseable, not fatal.
    return fallback;
  }
}

export const numOr = (v: unknown, fallback = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" || typeof v === "bigint") return toNumberFallback(v, fallback);
  return fallback;
};

/**
 * Lenient numeric coercion: accepts finite numbers and non-empty numeric
 * strings (e.g. "85.5" from RSC payloads). Returns null for anything else
 * (booleans, symbols, objects, empty strings, NaN/Infinity).
 */
export const numCoerce = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    try {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Validate an ISO-like date string (YYYY-MM-DD or full ISO with T/time).
 * Returns the trimmed string or null. Trims whitespace so cache keys stay
 * stable; rejects non-ISO formats that Date.parse would otherwise accept
 * (e.g. "Jan 1 2020", "2020/01/01").
 */
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\S*)?$/;
export const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || !ISO_LIKE_RE.test(trimmed)) return null;
  if (Number.isNaN(Date.parse(trimmed))) return null;
  // Return the trimmed string (not normalized): callers and cached payloads
  // rely on the upstream YYYY-MM-DD shape; normalization would churn cache keys.
  return trimmed;
};

/** Coerce to string: strings pass through, everything else becomes "". */
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Preserve null/undefined vs string distinction; non-strings become undefined. */
export const strOr = (v: unknown): string | null | undefined => (v == null ? v : typeof v === "string" ? v : undefined);
/** Strict boolean guard; anything else becomes undefined. */
export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
/** Strict plain-object guard (excludes null and arrays). */
export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

function numWhere(v: unknown, predicate: (n: number) => boolean): number | null {
  const n = num(v);
  return n != null && predicate(n) ? n : null;
}
export const numPositive = (v: unknown): number | null => numWhere(v, (n) => n > 0);
export const numNonNegative = (v: unknown): number | null => numWhere(v, (n) => n >= 0);

/** Truncated integer variant of numNonNegative (e.g. HF downloads/likes). */
export const numIntNonNegative = (v: unknown): number | null => {
  const n = numNonNegative(v);
  return n == null ? null : Math.trunc(n);
};
/* Shared parsing helpers: single home for the number/money/title patterns
 * duplicated across arena + official-pricing + openrouter. */

/** Leading decimal with optional commas ("1537±16" -> 1537, "27,189票" -> 27189). */
export const leadingNumber = (v: string): number | null => {
  const m = /^([\d.]+)/.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Leading integer with optional commas, rounded ("27,189票" -> 27189). */
export const leadingInt = (v: string): number | null => {
  const m = /^([\d,]+)/.exec(v.trim());
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** First dollar amount in a string ("$4.00 / $12" -> 4); null when absent. */
export const moneyAmount = (v: string): number | null => {
  const m = /\$([\d.]+)/.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Official pricing cell: "$4.00" -> 4, "-" / empty -> null, "Free" -> 0 (USD per 1M tokens). */
export const priceCell = (v: string): number | null => {
  const t = v.replace(/,/g, "").trim();
  if (!t || t === "-") return null;
  if (/^free$/i.test(t)) return 0;
  return moneyAmount(t);
};

/** Count with optional K/M suffix ("256K" -> 256000, "1.5M" -> 1500000). */
export const suffixedCount = (v: string): number | null => {
  const m = /^([\d.]+)\s*([KM])?/i.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "M") return Math.round(n * 1_000_000);
  if (suffix === "K") return Math.round(n * 1_000);
  return Math.round(n);
};

/** "deepseek" -> "Deepseek"; empty stays empty. */
export const titleCase = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

/** "Claude Opus 4.5" -> "claude-opus-4-5". */
export const slugifyName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "gpt-5 (2026-01)" -> "gpt-5". */
export const stripParen = (name: string): string => name.replace(/\s*\(.*\)\s*$/, "").trim();

/** "kimi-k2-thinking" -> "Kimi K2 Thinking" (keeps each token's inner casing). */
export const humanizeId = (id: string, prefix = ""): string => {
  const pretty = id
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
  return prefix ? prefix + " " + pretty : pretty;
};

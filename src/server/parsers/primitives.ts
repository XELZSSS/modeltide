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

export { isFiniteNumber, toStringOrNull } from "@/shared/utils";
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

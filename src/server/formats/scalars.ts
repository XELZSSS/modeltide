/** Coercion for values that arrive untyped from an upstream body. */

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

export const numOr = (v: unknown): number => numCoerce(v) ?? 0;

export const numCoerceNonNegative = (v: unknown): number | null => {
  const n = numCoerce(v);
  return n != null && n >= 0 ? n : null;
};

export const numIntCoerceNonNegative = (v: unknown): number | null => {
  const n = numCoerceNonNegative(v);
  return n == null ? null : Math.trunc(n);
};

export function numericLabel(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * A trimmed string, empty when the value is not one: the parser layer's default for a text field. Every wire reader
 * used to spell this as `str(v).trim()`, and the two other spellings of the same idea (`strOr`'s null/undefined pass-
 * through and the client's `toStringOrNull`) made a row's identity depend on which one a parser happened to import.
 */
export const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The trimmed string, or `null` when it is absent or empty — what an optional text field is stored as. */
export const textOrNull = (v: unknown): string | null => {
  const t = text(v);
  return t === "" ? null : t;
};

export const strOr = (v: unknown): string | null | undefined => (v == null ? v : typeof v === "string" ? v : undefined);

export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export const isRecord = (v: unknown): v is Record<string, unknown> => obj(v) !== undefined;

export const titleCase = (s: string): string =>
  s ? (s.length >= 2 && s === s.toUpperCase() ? s : s[0]!.toUpperCase() + s.slice(1).toLowerCase()) : s;

/** Cuts at a code-unit boundary without splitting a surrogate pair. */
export function truncateSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = max - 1;
  const c = s.charCodeAt(cut);
  return c >= 0xd800 && c <= 0xdbff ? s.slice(0, cut) : s.slice(0, max);
}

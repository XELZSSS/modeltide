export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toNumberFallback(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v as number);
  return Number.isFinite(n) ? n : fallback;
}

export const numOr = (v: unknown, fallback = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (v == null || typeof v === "object") return fallback;
  return toNumberFallback(v, fallback);
};

/** Validate an ISO date string (YYYY-MM-DD or full ISO), returns normalized string or null. */
export const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : v;
};

export const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const strOr = (v: unknown): string | null | undefined => (v == null ? v : typeof v === "string" ? v : undefined);
export const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export { isFiniteNumber, toStringOrNull } from "@/shared/utils";
function numWhere(v: unknown, predicate: (n: number) => boolean): number | null {
  const n = num(v);
  return n != null && predicate(n) ? n : null;
}
export const numPositive = (v: unknown): number | null => numWhere(v, (n) => n > 0);
export const numNonNegative = (v: unknown): number | null => numWhere(v, (n) => n >= 0);

import { isFiniteNumber } from "@/shared/utils";

export const num = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

export const numCoerce = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const numOr = (v: unknown, fallback = 0): number => numCoerce(v) ?? fallback;

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
export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
export const isRecord = (v: unknown): v is Record<string, unknown> => obj(v) !== undefined;

function numWhere(v: unknown, predicate: (n: number) => boolean): number | null {
  const n = num(v);
  return n != null && predicate(n) ? n : null;
}
export const numPositive = (v: unknown): number | null => numWhere(v, (n) => n > 0);
export const numNonNegative = (v: unknown): number | null => numWhere(v, (n) => n >= 0);

export const numIntNonNegative = (v: unknown): number | null => {
  const n = numNonNegative(v);
  return n == null ? null : Math.trunc(n);
};

export const titleCase = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

export const humanizeId = (id: string, prefix = ""): string => {
  const pretty = id
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
  return prefix ? prefix + " " + pretty : pretty;
};

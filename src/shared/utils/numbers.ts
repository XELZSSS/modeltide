export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Coerces 0-1 fraction scores onto a 0-100 scale, clamped. Values in (0, 1] are fractions — including
 * exactly 1.0 — so callers feeding 0-100-scale data must not expect an exact 1 to survive as 1%. */
export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

/** Same coercion without the clamp: AA's omniscience index runs below zero, so sign and magnitude are
 * kept. Idempotent, so it is safe on values a parser has already scaled. */
export function unclampedPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 && value <= 1 ? value * 100 : value;
}

export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

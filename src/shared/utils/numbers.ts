export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Coerces 0-1 fraction scores onto a 0-100 scale, clamped to [0, 100].
 * Heuristic: AA benchmark payloads are fraction-scaled, so values in (0, 1]
 * are treated as fractions — including exactly 1.0, which legitimately means
 * a perfect 100%. Callers feeding 0-100-scale data must not expect an
 * exact-1 value to survive as 1%.
 */
export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

export function computeBlendPrice(
  p?: { input?: number | null; output?: number | null; cacheHit?: number | null } | null,
): number | null {
  if (!p) return null;
  const input = isFiniteNumber(p.input) ? p.input : null;
  const output = isFiniteNumber(p.output) ? p.output : null;
  if (input == null || output == null) return null;
  // AA methodology: cache reads bill at the input rate when no cache tier exists.
  const cache = isFiniteNumber(p.cacheHit) ? p.cacheHit : input;
  return (7 * cache + 2 * input + output) / 10;
}

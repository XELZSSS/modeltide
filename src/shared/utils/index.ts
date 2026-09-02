// Isomorphic utilities shared between the React app and the Cloudflare Worker.
// App-only helpers (charts, cn, format, model) live in `src/client/utils`.

/** Keeps the first occurrence of each key; items with an empty key are always kept. */
export function dedupeBy<T>(items: T[], keyFn: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v.trim() || null : null;
}

/**
 * Percent-like benchmark values arrive in mixed scales (0-1 fractions from some
 * benchmarks, 0-100 percentage points from others); fractions are scaled up so
 * everything renders on one 0-100 scale, then clamped into the valid range.
 */
export function normalizePercent(value: number | null | undefined): number | null {
  if (value == null) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

/** Approximate equality using a relative epsilon, so scale doesn't matter. */
export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

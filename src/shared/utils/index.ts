export function dedupeBy<T>(items: T[], keyFn: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key) return false;
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

export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

export function fnv1aHash(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(s: string): number {
  let ascii = true;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) {
      ascii = false;
      break;
    }
  }
  if (ascii) return s.length;
  try {
    return utf8Encoder.encode(s).length;
  } catch {
    return s.length * 3;
  }
}

const QUALIFIER_TOKENS = new Set(["adaptive", "effort", "xhigh", "extended"]);

export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const main = lowered.slice(Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/")) + 1);
  return main
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
}

export function foldSearchStr(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

export function matchTerm(fields: string[], term: string): { matched: boolean; score: number } {
  const needle = foldSearchStr(term);
  if (!needle) return { matched: false, score: 0 };
  const normalized = fields.map(foldSearchStr);
  for (const f of normalized) if (f === needle) return { matched: true, score: 4 };
  let best = 0;
  for (const f of normalized) {
    if (f.startsWith(needle)) best = Math.max(best, 3);
    else if (f.includes(needle)) best = Math.max(best, 2);
  }
  return { matched: best > 0, score: best };
}

export function computeBlendPrice(
  p?: { input?: number | null; output?: number | null; cacheHit?: number | null } | null,
): number | null {
  if (!p) return null;
  const input = isFiniteNumber(p.input) ? p.input : null;
  const output = isFiniteNumber(p.output) ? p.output : null;
  if (input == null || output == null) return null;
  const cache = isFiniteNumber(p.cacheHit) ? p.cacheHit : input;
  return (7 * cache + 2 * input + output) / 10;
}

export function isEmptyT2i(payload: { models?: unknown } | null | undefined): boolean {
  return !payload || !Array.isArray(payload.models) || payload.models.length === 0;
}

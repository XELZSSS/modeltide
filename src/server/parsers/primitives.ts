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
 * Lenient numeric coercion: finite numbers and numeric strings.
 * Null for anything else (booleans, objects, empty strings, NaN/Infinity).
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
 * Validate an ISO-like date string (YYYY-MM-DD or full ISO).
 * Returns the trimmed string or null. Trims whitespace so cache keys stay
 * stable; rejects non-ISO formats Date.parse would otherwise accept.
 */
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\S*)?$/;
export const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || !ISO_LIKE_RE.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  // Reject non-existent calendar dates (2026-02-30 normalizes to Mar 02).
  const datePart = trimmed.slice(0, 10);
  const normalized = new Date(`${datePart}T00:00:00Z`).toISOString().slice(0, 10);
  if (normalized !== datePart) return null;
  // Return the trimmed string (not normalized): callers and cached payloads
  // rely on the upstream YYYY-MM-DD shape; normalization would churn cache keys.
  return trimmed;
};

/** Coerce to string; everything else becomes "". */
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Preserve null/undefined; non-strings become undefined. */
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

/** Truncated integer variant of numNonNegative. */
export const numIntNonNegative = (v: unknown): number | null => {
  const n = numNonNegative(v);
  return n == null ? null : Math.trunc(n);
};
/* Shared number/money/title patterns for arena + official-pricing + openrouter. */

/** Leading decimal with optional commas ("1537±16" -> 1537, "27,189票" -> 27189). */
export const leadingNumber = (v: string): number | null => {
  const m = /^([\d.]+)/.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Leading integer with optional commas. */
export const leadingInt = (v: string): number | null => {
  const m = /^([\d,]+)/.exec(v.trim());
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** First dollar amount ("$4.00 / $12" -> 4); null when absent. */
export const moneyAmount = (v: string): number | null => {
  const m = /\$([\d.]+)/.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Pricing cell: "$4.00" -> 4, "-" / empty -> null, "Free" -> 0 ($/1M). */
export const priceCell = (v: string): number | null => {
  const t = v.replace(/,/g, "").trim();
  if (!t || t === "-") return null;
  if (/^free$/i.test(t)) return 0;
  return moneyAmount(t);
};

/** Count with optional K/M/B suffix ("256K" -> 256000, "1.5M" -> 1500000, "1.2B" -> 1200000000). */
export const suffixedCount = (v: string): number | null => {
  const m = /^([\d.]+)\s*([KMB])?/i.exec(v.replace(/,/g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "B") return Math.round(n * 1_000_000_000);
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

/* HF license:* allowlist. */

const OPEN_LICENSES = new Set([
  "apache-2.0",
  "mit",
  "bsd",
  "bsd-2-clause",
  "bsd-3-clause",
  "isc",
  "cc",
  "cc0-1.0",
  "cc-by-4.0",
  "cc-by-sa-4.0",
  // "cc-by-nd-4.0" (NoDerivatives) is excluded: too restrictive to count as open.
  // NC variants stay in deliberately — the open-weights convention treats
  // non-commercial licenses as open even though they fail strict OSI terms.
  "cc-by-nc-4.0",
  "cc-by-nc-sa-4.0",
  "odc-by",
  "wtfpl",
  "bigscience-openrail-m",
  "bigscience-bloom-rail-1.0",
  "openrail",
  "creativeml-openrail-m",
  "openrail++",
  "bigcode-openrail-m",
  "llama3.1",
  "llama3",
  "llama2",
  "gemma",
  "gemma2",
  "gemma-2.0",
  "qwen",
  "falcon",
  "mpt",
  "deepseek",
  "yi",
  "mistral",
  "mixtral",
  "codestral",
  "phi",
  "smollm",
  "granite",
  "olmo",
  "starcoder",
  "stablelm",
  "bloom",
  "gpl",
  "gpl-2.0",
  "gpl-3.0",
  "agpl-3.0",
  "lgpl",
  "lgpl-2.1",
  "lgpl-3.0",
  "mpl-2.0",
  "epl-2.0",
  "osl-3.0",
  "unlicense",
  "zlib",
  "mulanpsl-1.0",
  "mulanpsl-2.0",
  "nvidia-open-model-license",
  "sil-openrail-1.0",
  "artistic-2.0",
]);
// Note: "other" is excluded — on HF it usually means a custom license.
// Prefix fallback catches new SPDX variants (llama4, qwen3) without manual bumps.
const OPEN_PREFIXES = [
  "apache",
  "mit",
  "bsd",
  "isc",
  "cc",
  "odc-by",
  "openrail",
  "bigscience",
  "bigcode",
  "creativeml",
  "llama",
  "gemma",
  "qwen",
  "falcon",
  "mpt",
  "deepseek",
  "yi",
  "mistral",
  "mixtral",
  "codestral",
  "phi",
  "smollm",
  "granite",
  "olmo",
  "starcoder",
  "stablelm",
  "bloom",
  "ministral",
  "gpl",
  "agpl",
  "lgpl",
  "mpl",
  "epl",
  "unlicense",
  "wtfpl",
  "mulanpsl",
  "artistic",
  "zlib",
];
/** NoDerivatives CC variants are too restrictive to count as open. */
function isDeniedNoDerivatives(id: string): boolean {
  return id.startsWith("cc-") && (id.includes("-nd-") || id.endsWith("-nd"));
}
const matchesPrefix = (id: string, p: string): boolean => {
  if (id === p) return true;
  if (!id.startsWith(p)) return false;
  const next = id[p.length];
  if (next === "-" || next === "." || next === "_") return true;
  // Versioned families: llama4, gemma3, qwen2.5 — prefix directly followed by a digit/dot.
  if (next !== undefined && (next === "." || (next >= "0" && next <= "9"))) return true;
  return false;
};
/** Normalize separators so "apache_2.0" and "Apache-2.0" map to one id. */ function normalizeLicenseId(
  raw: string,
): string {
  return raw.toLowerCase().trim().replace(/_+/g, "-").replace(/\s+/g, "");
}
/**
 * Return the normalized open license id from HF `license:*` tags, or null.
 * First match wins; dual-license tags resolve to the first open entry.
 */
export const getOpenLicense = (tags: string[]): string | null => {
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const lower = t.toLowerCase().trim();
    if (!lower.startsWith("license:")) continue;
    const id = normalizeLicenseId(lower.slice(8));
    if (!id || isDeniedNoDerivatives(id)) continue;
    if (OPEN_LICENSES.has(id)) return id;
    if (OPEN_PREFIXES.some((p) => matchesPrefix(id, p))) return id;
  }
  return null;
};

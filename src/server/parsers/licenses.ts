const OPEN_LICENSES = new Set(["openrail++", "osl-3.0", "nvidia-open-model-license", "sil-openrail-1.0"]);
const SPDX_PREFIXES = [
  "apache",
  "mit",
  "bsd",
  "isc",
  "cc",
  "odc-by",
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
const MODEL_FAMILY_PREFIXES = [
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
];
const OPEN_PREFIXES = [...SPDX_PREFIXES, ...MODEL_FAMILY_PREFIXES];

/**
 * Clauses that make a Creative Commons license non-open: NC (no commercial use)
 * and ND (no derivatives). Matched with or without a separator before the
 * version (`cc-by-nc-4.0`, `cc-by-nc4.0`), so both spellings are denied.
 */
const DENIED_CC_CLAUSE_RE = /(?:^|-)n[cd](?:\d|\.|-|$)/;
const hasDeniedCcClause = (id: string): boolean => id.startsWith("cc-") && DENIED_CC_CLAUSE_RE.test(id);

/** HF licence ids that mean "declared, but not open" rather than "unrecognized". */
const KNOWN_NON_OPEN = new Set(["other", "unknown", "proprietary"]);

/**
 * True when the gate rejects a licence id for a reason it understands, as
 * opposed to a value it does not recognize: HF's own non-open sentinels plus
 * the CC clauses (NC/ND) the gate denies outright.
 */
export const isRecognizedNonOpenLicense = (id: string): boolean =>
  KNOWN_NON_OPEN.has(id) || hasDeniedCcClause(id);

const matchesPrefix = (id: string, p: string): boolean => {
  if (id === p) return true;
  if (!id.startsWith(p)) return false;
  const next = id[p.length]!;
  return next === "-" || next === "." || next === "_" || (next >= "0" && next <= "9");
};
function normalizeLicenseId(raw: string): string {
  return raw.toLowerCase().trim().replace(/_+/g, "-").replace(/\s+/g, "");
}

/** Normalized licence id of a `license:` tag, or null when the tag is not one. */
export function licenseTagId(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const lower = tag.toLowerCase().trim();
  if (!lower.startsWith("license:")) return null;
  return normalizeLicenseId(lower.slice(8)) || null;
}

export const getOpenLicenseId = (ids: readonly string[]): string | null => {
  for (const id of ids) {
    if (hasDeniedCcClause(id)) continue;
    if (OPEN_LICENSES.has(id)) return id;
    if (OPEN_PREFIXES.some((p) => matchesPrefix(id, p))) return id;
  }
  return null;
};

export const getOpenLicense = (tags: string[]): string | null =>
  getOpenLicenseId(tags.map(licenseTagId).filter((id): id is string => id != null));

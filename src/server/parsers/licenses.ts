const OPEN_LICENSES = new Set([
  "openrail++",
  "osl-3.0",
  "nvidia-open-model-license",
  "sil-openrail-1.0",
  "bsl-1.0",
  "ms-pl",
  "ncsa",
  "ecl-2.0",
  "lppl-1.3c",
  "postgresql",
  "pddl",
  "ofl-1.1",
]);

const OPEN_LICENSE_PREFIX_RE =
  /^(?:apache|mit|bsd|isc|cdla|etalab|eupl|afl|gfdl|odbl|odc-by|openmdw|cc0|cc-by|gpl|agpl|lgpl|mpl|epl|artistic|zlib|unlicense|wtfpl|mulanpsl|openrail|bigscience|bigcode|creativeml|llama|gemma|qwen|falcon|mpt|deepseek|yi|mistral|mixtral|codestral|phi|smollm|granite|olmo|starcoder|stablelm|bloom|ministral)(?:[-._]|\d|$)/;

const DENIED_CC_CLAUSE_RE = /(?:^|-)n[cd](?:\d|\.|-|$)/;
const hasDeniedCcClause = (id: string): boolean => id.startsWith("cc-") && DENIED_CC_CLAUSE_RE.test(id);

const KNOWN_NON_OPEN = new Set([
  "other",
  "unknown",
  "proprietary",
  "apple-amlr",
  "apple-ascl",
  "c-uda",
  "deepfloyd-if-license",
  "fair-noncommercial-research-license",
  "grok2-community",
  "h-research",
  "intel-research",
]);

export const isRecognizedNonOpenLicense = (id: string): boolean => KNOWN_NON_OPEN.has(id) || hasDeniedCcClause(id);

// Caller (licenseTagId) already lowercases and trims; only structural normalization remains.
function normalizeLicenseId(raw: string): string {
  return raw.replace(/_+/g, "-").replace(/\s+/g, "");
}

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
    if (OPEN_LICENSE_PREFIX_RE.test(id)) return id;
  }
  return null;
};

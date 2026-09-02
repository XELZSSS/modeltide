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
// Note: "other" is deliberately excluded — on HF it usually means a custom or
// restricted license, so counting it as open would pollute the open-source board.
// Prefix fallback below catches new SPDX variants (e.g. llama4, qwen3) without
// a manual bump for every upstream addition.
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
/**
 * NoDerivatives CC variants are too restrictive to count as open, even though
 * the "cc" prefix would otherwise match them (e.g. cc-by-nd-4.0,
 * cc-by-nc-nd-4.0). Checked before the open allowlist.
 */
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
/** Normalize separators so "apache_2.0" and "Apache-2.0" map to one id. */
function normalizeLicenseId(raw: string): string {
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

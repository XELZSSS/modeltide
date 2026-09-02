const OPEN_LICENSES = new Set(["openrail++", "osl-3.0", "nvidia-open-model-license", "sil-openrail-1.0"]);
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
function isDeniedNoDerivatives(id: string): boolean {
  return id.startsWith("cc-") && (id.includes("-nd-") || id.endsWith("-nd"));
}
const matchesPrefix = (id: string, p: string): boolean => {
  if (id === p) return true;
  if (!id.startsWith(p)) return false;
  const next = id[p.length];
  return next === undefined || next === "-" || next === "." || next === "_" || (next >= "0" && next <= "9");
};
function normalizeLicenseId(raw: string): string {
  return raw.toLowerCase().trim().replace(/_+/g, "-").replace(/\s+/g, "");
}
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

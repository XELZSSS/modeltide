export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
} as const satisfies Record<"artificialAnalysis" | "huggingface" | "openrouter", string>;

/** Default upstream fetch timeout (HttpClient fallback is 10s; sources override with this) */
export const UPSTREAM_TIMEOUT_MS = 15_000;
/** Probe (source health check) timeout */
export const PROBE_TIMEOUT_MS = 8_000;

export const USER_AGENT = "AITIWETA/1.0";
export const WARM_ORIGIN = "https://aitiweta.internal";

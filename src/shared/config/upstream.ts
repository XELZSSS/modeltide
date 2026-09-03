// Upstream endpoints are intentionally static (no per-env switching): the Worker
// has no staging tier, and dev uses the same public sources. If a staging mirror
// is ever needed, inject overrides via Wrangler vars (keep_vars is false, so this
// file stays the source of truth) rather than branching on NODE_ENV here.
// NOTE: repo lives at .../aiinsights locally but deploys as "modeltide" (USER_AGENT,
// WARM_ORIGIN, REPO_URL all use the deployed name) — keep them in sync on rename.
export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
} as const satisfies Record<"artificialAnalysis" | "huggingface" | "openrouter", string>;

/** Default upstream fetch timeout (HttpClient fallback is 10s; sources override with this) */
export const UPSTREAM_TIMEOUT_MS = 15_000;
/** Probe (source health check) timeout */
export const PROBE_TIMEOUT_MS = 8_000;

export const USER_AGENT = "ModelTide/2.0 (+https://github.com/XELZSSS/modeltide)";
export const WARM_ORIGIN = "https://modeltide.internal";

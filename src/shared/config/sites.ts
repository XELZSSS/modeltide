/**
 * The site roots the app links to and talks to. One table on purpose: a URL assembled from a literal somewhere else is
 * what shipped a 404 — `ClosedReleaseEntry.link` was built by hand from the release slug instead of the model slug, and
 * neither a type nor a lint rule can see a wrong string.
 *
 * `src/server/upstream/upstream.ts` reads the same roots, so the API and the links the app offers cannot drift, and
 * `build/consistency-guard.ts` fails the build when a `https://` literal appears outside this file (or the feed list,
 * which owns its own URLs).
 */
export const SITE_URLS = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co",
  openRouter: "https://openrouter.ai",
  repository: "https://github.com/XELZSSS/modeltide",
} as const;

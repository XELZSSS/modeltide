/**
 * The site roots the app links to and talks to. One table on purpose: a URL assembled from a literal elsewhere shipped
 * a 404 that neither a type nor a lint rule could see. `src/server/upstream/upstream.ts` reads the same roots, and
 * `build/consistency-guard.ts` fails the build when a `https://` literal appears outside this file or the feed list.
 */
export const SITE_URLS = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co",
  openRouter: "https://openrouter.ai",
  repository: "https://github.com/XELZSSS/modeltide",
  cursor: "https://cursor.com",
} as const;

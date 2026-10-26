export const CLIENT_OUT_DIR_NAME = "dist";
export const VERSION_DIRS = ["assets", "icons", "fonts"];
export const VERSION_FILES = ["index.html", "manifest.webmanifest"];
export { API_PREFIX } from "../src/shared/config/api.ts";

/**
 * The Pages Function, as a repo-relative POSIX path (the Vite dev middleware needs the URL form below). Every script
 * that reads or writes this file goes through these two constants: a rename that only reached `bundle-functions.mjs`
 * left `clean` silently deleting nothing, and `npm run build` never calls clean, so an old bundle keeps sitting in
 * `functions/api/` ready to be uploaded.
 */
export const FUNCTIONS_ENTRY = "src/server/entry.ts";
export const FUNCTIONS_OUT = "functions/api/[[route]].js";
export const FUNCTIONS_ROUTE = `/${FUNCTIONS_ENTRY}`;

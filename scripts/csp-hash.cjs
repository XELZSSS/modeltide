// @ts-check
// Computes the CSP sha256 hash for the inline theme pre-paint script in index.html.
// The hash must be computed over the text as the BROWSER sees it: HTML input
// preprocessing normalizes CRLF/CR to LF, so normalize before hashing. This keeps the
// hash correct regardless of the build machine's line endings.
// Usage:
//   node scripts/csp-hash.cjs                 print the hash
//   node scripts/csp-hash.cjs --write         rewrite the script-src sha256 token in
//                                             public/_headers and dist/client/_headers
//   node scripts/csp-hash.cjs --html <path>   use a different built html file;
//                                             accepts an absolute path or a path
//                                             relative to the current workdir
//                                             (e.g. npm --prefix <dir> or --workdir runs).
// `vite build` runs the --write form afterwards so a deploy can never ship a stale
// hash after the inline theme script changes.
// Type-check without renaming to .mts (rename risk avoided):
//   npx tsc --allowJs --checkJs --noEmit scripts/csp-hash.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const write = args.includes("--write");
const htmlFlagIndex = args.indexOf("--html");
// Default build output; path.resolve handles both absolute paths and
// workdir-relative paths (respects the caller's cwd, incl. --prefix/--workdir).
const htmlPath = path.resolve(
  htmlFlagIndex !== -1 && args[htmlFlagIndex + 1] ? args[htmlFlagIndex + 1] : "dist/client/index.html",
);
const headerPaths = ["public/_headers", "dist/client/_headers"];
// public/_headers is the checked-in source of truth and must exist;
// dist/client/_headers only exists after a build, so its absence is a skip, not an error.
const requiredHeaderPaths = new Set(["public/_headers"]);

if (!fs.existsSync(htmlPath)) {
  console.error(`built html not found at ${htmlPath} — run npm run build first`);
  process.exit(1);
}
const html = fs.readFileSync(htmlPath, "utf8");
// Locate the inline theme pre-paint script by its unique marker instead of "the
// first <script> tag", so build tooling inserting other inline scripts earlier
// in <head> can never make the hash cover the wrong block.
const THEME_MARKER = "themeMode";
let script = null;
for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
  const body = match[1].replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (body.includes(THEME_MARKER)) {
    script = body;
    break;
  }
}
if (!script) {
  console.error(`no inline theme script (containing "${THEME_MARKER}") found in ${htmlPath} — run npm run build first`);
  process.exit(1);
}
const token = "sha256-" + crypto.createHash("sha256").update(script, "utf8").digest("base64");

if (!write) {
  console.log(token);
  process.exit(0);
}

let updated = false;
for (const headerPath of headerPaths) {
  if (!fs.existsSync(headerPath)) {
    if (requiredHeaderPaths.has(headerPath)) {
      console.error(`required headers file ${headerPath} is missing — refusing to continue`);
      process.exit(1);
    }
    console.log(`${headerPath}: not present (build output) — skipped`);
    continue;
  }
  const headers = fs.readFileSync(headerPath, "utf8");
  // Replace ONLY the token inside the script-src directive: a global
  // sha256 replace could clobber unrelated hashes (e.g. a future style-src token).
  const scriptSrcPattern = /(script-src[^;]*?)(sha256-[A-Za-z0-9+/=]+)/;
  if (!scriptSrcPattern.test(headers)) {
    console.error(`no script-src sha256 token found in ${headerPath} — add one to the script-src directive first`);
    process.exit(1);
  }
  const next = headers.replace(scriptSrcPattern, `$1${token}`);
  if (next !== headers) {
    fs.writeFileSync(headerPath, next);
    console.log(`${headerPath}: CSP hash updated to ${token}`);
    updated = true;
  } else {
    console.log(`${headerPath}: CSP hash already up to date`);
  }
}
if (!updated) process.exit(0);

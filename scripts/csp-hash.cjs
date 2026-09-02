// Computes the CSP sha256 hash for the inline theme pre-paint script in index.html.
// The hash must be computed over the text as the BROWSER sees it: HTML input
// preprocessing normalizes CRLF/CR to LF, so normalize before hashing. This keeps the
// hash correct regardless of the build machine's line endings.
// Usage:
//   node scripts/csp-hash.cjs          print the hash
//   node scripts/csp-hash.cjs --write  rewrite the script-src sha256 token in
//                                      public/_headers and dist/client/_headers
// `vite build` runs the --write form afterwards so a deploy can never ship a stale
// hash after the inline theme script changes.
const fs = require("fs");
const crypto = require("crypto");

const write = process.argv.includes("--write");
const htmlPath = "dist/client/index.html";
const headerPaths = ["public/_headers", "dist/client/_headers"];

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
  if (!fs.existsSync(headerPath)) continue;
  const headers = fs.readFileSync(headerPath, "utf8");
  if (!/sha256-[A-Za-z0-9+/=]+/.test(headers)) {
    console.error(`no sha256 token found in ${headerPath} — add one to the script-src directive first`);
    process.exit(1);
  }
  const next = headers.replace(/sha256-[A-Za-z0-9+/=]+/g, token);
  if (next !== headers) {
    fs.writeFileSync(headerPath, next);
    console.log(`${headerPath}: CSP hash updated to ${token}`);
    updated = true;
  } else {
    console.log(`${headerPath}: CSP hash already up to date`);
  }
}
if (!updated) process.exit(0);

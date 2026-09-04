// @ts-check
// CSP sha256 for the inline theme script in index.html. Hash the text as the
// BROWSER sees it (normalize CRLF/CR to LF first).
// Usage:
//   node scripts/csp-hash.cjs                 print the hash
//   node scripts/csp-hash.cjs --write         rewrite the script-src sha256 token in
//                                             public/_headers and dist/client/_headers
//   node scripts/csp-hash.cjs --html <path>   use a different built html file
// (vite build runs --write afterwards so deploys never ship a stale hash.)
// Type-check: npx tsc --allowJs --checkJs --noEmit scripts/csp-hash.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const write = args.includes("--write");
const htmlFlagIndex = args.indexOf("--html");
// Default build output; resolves absolute and workdir-relative paths.
const htmlPath = path.resolve(
  htmlFlagIndex !== -1 && args[htmlFlagIndex + 1] ? args[htmlFlagIndex + 1] : "dist/client/index.html",
);
const headerPaths = ["public/_headers", "dist/client/_headers"];
// public/_headers must exist; dist/client/_headers only exists after a build.
const requiredHeaderPaths = new Set(["public/_headers"]);

if (!fs.existsSync(htmlPath)) {
  console.error(`built html not found at ${htmlPath} — run npm run build first`);
  process.exit(1);
}
const html = fs.readFileSync(htmlPath, "utf8");
// Locate the theme script by marker, not "first <script>" (build tooling may prepend others).
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
  // Replace only the script-src token (a global replace could clobber other hashes).
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

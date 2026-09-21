// @ts-check
const fs = require("fs");
const path = require("path");
const { stripComments, walkTs } = require("./_util.cjs");

const ROOT = path.resolve("src/shared");

let failed = false;
function check(file) {
  const src = fs.readFileSync(file, "utf8");
  const code = stripComments(src);
  const patterns = [
    /\btypeof\s+(document|window|navigator|localStorage|sessionStorage|location|globalThis|self|caches|indexedDB|history|screen)\b/,
    // `\??\.` also catches optional chaining (`window?.matchMedia`), which
    // reaches the identical runtime global.
    /\b(document|window|navigator|localStorage|sessionStorage|location|globalThis|self|caches|indexedDB|matchMedia|customElements|history|screen)\s*\??\./,
    /\b(document|window|navigator|localStorage|sessionStorage|location|globalThis|self|caches|indexedDB|history|screen)\s*\??\.?\s*\[/,
    /\b(new\s+(HTMLElement|Image|Audio|XMLHttpRequest|IntersectionObserver|ResizeObserver|MutationObserver)|requestAnimationFrame|cancelAnimationFrame)\b/,
    /\bHTMLElement\b/,
    /\b(process\s*\.\s*env|process\s*\.\s*argv|global\s*\.\s*process)\b/,
    /\b(Buffer\s*\.)/,
    /from\s*['"]node:/,
    /require\s*\(\s*['"]node:/,
  ];
  for (const re of patterns) {
    const m = code.match(re);
    if (m) {
      console.error(`shared-dom: ${path.relative(".", file)} matches banned DOM usage "${m[0].trim()}"`);
      failed = true;
    }
  }
}
if (!fs.existsSync(ROOT)) {
  console.log("check-shared-dom: no src/shared (skip)");
  process.exit(0);
}
for (const file of walkTs(ROOT)) check(file);
if (failed) process.exit(1);
console.log("check-shared-dom: ok (no DOM globals in src/shared)");

// @ts-check
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve("src/shared");

let failed = false;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) check(full);
  }
}
function check(file) {
  const src = fs.readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.split("//")[0])
    .join("\n");
  const patterns = [
    /\btypeof\s+(document|window|navigator|localStorage|sessionStorage)\b/,
    /\b(document|window|navigator|localStorage|sessionStorage|location)\s*\./,
    /\b(document|window|navigator|localStorage|sessionStorage|location)\s*\[/,
    /\bnew\s+HTMLElement\b/,
    /\bHTMLElement\b/,
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
walk(ROOT);
if (failed) process.exit(1);
console.log("check-shared-dom: ok (no DOM globals in src/shared)");

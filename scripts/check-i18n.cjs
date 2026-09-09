// @ts-check
const fs = require("fs");
const path = require("path");

function loadDict(file) {
  const src = fs.readFileSync(path.resolve(file), "utf8");
  // Support 2-space indent and keys with word chars, hyphens or dots
  const keys = [...src.matchAll(/^\s{2}([\w.-]+):/gm)].map((m) => m[1]);
  const placeholders = new Map();
  // Capture both double-quoted and single-quoted string values
  const entryRE = /^\s{2}([\w.-]+):\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/gm;
  for (const m of src.matchAll(entryRE)) {
    const key = m[1];
    const raw = m[2] ?? m[3] ?? "";
    const params = [...raw.matchAll(/\{([\w.-]+)\}/g)]
      .map((p) => p[1])
      .sort()
      .join(",");
    placeholders.set(key, params);
  }
  return { keys, placeholders };
}

const en = loadDict("src/shared/i18n/en.ts");
const zh = loadDict("src/shared/i18n/zh.ts");
const enSet = new Set(en.keys);
const zhSet = new Set(zh.keys);
let failed = false;
for (const k of en.keys) {
  if (!zhSet.has(k)) {
    console.error(`i18n: zh missing key "${k}"`);
    failed = true;
  } else if (en.placeholders.get(k) !== zh.placeholders.get(k)) {
    console.error(
      `i18n: placeholder mismatch for "${k}": en={${en.placeholders.get(k)}} zh={${zh.placeholders.get(k)}}`,
    );
    failed = true;
  }
}
for (const k of zh.keys) {
  if (!enSet.has(k)) {
    console.error(`i18n: zh has extra key "${k}" not in en`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`i18n: ok (${en.keys.length} keys)`);

const manifest = fs.readFileSync(path.resolve("public/manifest.webmanifest"), "utf8");
if (!manifest.includes("ModelTide")) console.warn("i18n: warn manifest missing ModelTide name");

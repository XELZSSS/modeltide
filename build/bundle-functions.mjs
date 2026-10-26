import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { rootDir } from "../vite.shared.ts";
import { errMsg } from "../src/shared/utils/text.ts";
import { FUNCTIONS_ENTRY, FUNCTIONS_OUT } from "./constants.ts";

const ENTRY = path.join(rootDir, FUNCTIONS_ENTRY);
const OUT = path.join(rootDir, FUNCTIONS_OUT);

function fail(message) {
  console.error(`bundle:functions ${message}`);
  process.exit(1);
}

/**
 * Ceiling for the bundled worker. The budget is per-invocation CPU and cold-start size: the unminified build sat at
 * ~294 KB and minification alone lands near 140 KB, so this leaves roughly 20 KB of room for genuine growth while
 * still failing on a regression that pulls in something large instead of letting the bundle creep up unnoticed.
 */
const MAX_BUNDLE_BYTES = 160 * 1024;

function main() {
  if (!fs.existsSync(ENTRY)) fail(`missing entry: ${ENTRY}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    alias: { "@": path.join(rootDir, "src") },
    outfile: OUT,
    minify: true,
    logLevel: "warning",
  });
  const code = fs.readFileSync(OUT, "utf8");
  // `from"./x"` is what minified output looks like: the whitespace is optional, so the check cannot require it.
  const RELATIVE_IMPORT = /from\s*["']\.{1,2}\//;
  const RELATIVE_DYNAMIC_IMPORT = /import\s*\(\s*["']\.{1,2}\//;
  if (RELATIVE_IMPORT.test(code) || RELATIVE_DYNAMIC_IMPORT.test(code)) {
    fail("output still contains relative imports; expected a self-contained bundle");
  }
  if (!code.includes("onRequest")) fail("output does not export onRequest");
  const bytes = Buffer.byteLength(code);
  if (bytes > MAX_BUNDLE_BYTES) fail(`bundle is ${bytes} bytes, above the ${MAX_BUNDLE_BYTES} byte budget`);
  console.log(`bundle:functions wrote ${path.relative(rootDir, OUT)} (${bytes} bytes)`);
}

try {
  main();
} catch (err) {
  fail(`failed: ${errMsg(err)}`);
}

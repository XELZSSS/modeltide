// Wrangler's Functions bundler cannot resolve the @ -> src alias, so the checked-in source stays in src/server and this bundle is gitignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENTRY = path.join(ROOT, "src", "server", "entry.ts");
const OUT = path.join(ROOT, "functions", "api", "[[route]].js");

function fail(message) {
  console.error(`bundle:functions ${message}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(ENTRY)) fail(`missing entry: ${ENTRY}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const result = buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    alias: { "@": path.join(ROOT, "src") },
    outfile: OUT,
    minify: false,
    logLevel: "warning",
  });
  if (result.errors.length > 0) fail("esbuild reported errors");
  const code = fs.readFileSync(OUT, "utf8");
  if (/from\s+["']\.[./]/.test(code)) fail("output still contains relative imports; expected a self-contained bundle");
  if (!code.includes("onRequest")) fail("output does not export onRequest");
  console.log(`bundle:functions wrote ${path.relative(ROOT, OUT)} (${code.length} bytes)`);
}

try {
  main();
} catch (err) {
  fail(`failed: ${err instanceof Error ? err.message : String(err)}`);
}

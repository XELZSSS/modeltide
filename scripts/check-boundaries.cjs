// @ts-check
// Layering guard: client/server/shared isolation + route-feature isolation.
const fs = require("fs");
const path = require("path");

const ROUTE_FEATURES = ["home", "rankings", "releases", "news", "status", "compare", "models"];

const ALLOW = new Set([
  "src/client/features/rankings/aa/cells.tsx|models",
  "src/client/features/rankings/OpenRouterRankingsView.tsx|models",
]);

let failed = false;
function fail(msg) {
  console.error(`boundaries: ${msg}`);
  failed = true;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.split("//")[0])
    .join("\n");
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpec(fromFile, spec) {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) {
    return path.relative(".", path.resolve(path.dirname(fromFile), spec)).replace(/\\/g, "/");
  }
  return null;
}

if (!fs.existsSync("src")) {
  console.log("check-boundaries: no src (skip)");
  process.exit(0);
}

for (const file of walk("src")) {
  const rel = path.relative(".", file).replace(/\\/g, "/");
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const ownFeature = (rel.match(/^src\/client\/features\/([a-z-]+)\//) ?? [])[1];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1] ?? m[2];
    if (rel.startsWith("src/client/") && spec.startsWith("@/server/")) {
      fail(`${rel} imports server-only "${spec}" (client bundle leak)`);
    }
    if (rel.startsWith("src/server/") && spec.startsWith("@/client/")) {
      fail(`${rel} imports client code "${spec}"`);
    }
    if (
      rel.startsWith("src/shared/") &&
      (spec.startsWith("@/server/") || spec.startsWith("@/client/"))
    ) {
      fail(`${rel} imports layered code "${spec}" (shared must stay pure)`);
    }
    if (ownFeature && ROUTE_FEATURES.includes(ownFeature)) {
      const resolved = resolveSpec(file, spec);
      const target = resolved ? (resolved.match(/^src\/client\/features\/([a-z-]+)\//) ?? [])[1] : undefined;
      if (target && target !== ownFeature && ROUTE_FEATURES.includes(target)) {
        if (!ALLOW.has(`${rel}|${target}`)) {
          fail(`${rel} imports route feature "${target}" via "${spec}"`);
        }
      }
    }
  }
}

if (failed) process.exit(1);
console.log("check-boundaries: ok (layers + feature isolation)");

// @ts-check
// Layering guard: client/server/shared isolation + route-feature isolation.
// Vite + Workers layout:
//   - worker layer: worker/** (entrypoint) imports @/server/**
//   - client layer: src/client/** (must never import @/server/*)
//   - server layer: src/server/** (must never import @/client/*)
//   - shared: src/shared/** (must stay pure)

const fs = require("fs");
const path = require("path");
const { walkTs: walk, stripComments } = require("./_util.cjs");

const CLIENT_APP_RE = /^src\/client\/(main|router)\.tsx$/;
const PAGE_RE = /^$/;

let ROUTE_FEATURES = ["home", "rankings", "releases", "news", "status", "compare", "models"];
try {
  const feats = fs.readdirSync("src/client/features", { withFileTypes: true });
  const dynamic = feats.filter((d) => d.isDirectory()).map((d) => d.name);
  if (dynamic.length) ROUTE_FEATURES = dynamic;
} catch {}

const ALLOW = new Set([
  "src/client/features/rankings/aa/cells.tsx|models",
  "src/client/features/rankings/OpenRouterRankingsView.tsx|models",
]);

let failed = false;
function fail(msg) {
  console.error(`boundaries: ${msg}`);
  failed = true;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|export\s*(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;

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

for (const file of [...walk("src"), ...(fs.existsSync("worker") ? walk("worker") : [])]) {
  const rel = path.relative(".", file).replace(/\\/g, "/");
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const ownFeature = (rel.match(/^src\/client\/features\/([a-z-]+)\//) ?? [])[1];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec) continue;
    const isServerFile = rel.startsWith("src/server/") || rel.startsWith("worker/");
    const isClientFile = rel.startsWith("src/client/") || CLIENT_APP_RE.test(rel);
    const isPageFile = PAGE_RE.test(rel);
    if (!isPageFile && isClientFile && (spec === "@/server" || spec.startsWith("@/server/"))) {
      fail(`${rel} imports server-only "${spec}" (client bundle leak)`);
    }
    if (!isPageFile && isServerFile && (spec === "@/client" || spec.startsWith("@/client/"))) {
      fail(`${rel} imports client code "${spec}"`);
    }
    if (rel.startsWith("src/shared/")) {
      const resolved = resolveSpec(file, spec);
      const isLayered =
        spec.startsWith("@/server") ||
        spec.startsWith("@/client/") ||
        spec === "server-only" ||
        spec.includes("server-only") ||
        (resolved != null && (resolved.startsWith("src/server/") || resolved.startsWith("src/client/")));
      if (isLayered) {
        fail(`${rel} imports layered code "${spec}" (shared must stay pure)`);
      }
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

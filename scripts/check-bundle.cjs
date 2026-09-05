// @ts-check
// CI guard: the client bundle must not contain server-only chunks.
// Usage: node scripts/check-bundle.cjs (runs after vite build)
const fs = require("fs");
const path = require("path");

const dir = path.resolve("dist/client/assets");
if (!fs.existsSync(dir)) {
  console.log("check-bundle: no dist/client/assets (skip)");
  process.exit(0);
}
const files = fs.readdirSync(dir);
const bad = files.filter((f) => f.includes("server-only-violation"));
if (bad.length > 0) {
  console.error(`check-bundle: server-only modules leaked into client bundle: ${bad.join(", ")}`);
  process.exit(1);
}
console.log("check-bundle: ok (no server-only chunk)");

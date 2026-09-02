// @ts-check
/// <reference types="node" />
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
const markers = ["fast-xml-parser", 'from"hono', "from 'hono", 'from "hono'];
const hits = [];
for (const f of files) {
  if (!f.endsWith(".js")) continue;
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  if (markers.some((m) => src.includes(m))) hits.push(f);
}
if (hits.length > 0) {
  console.error(`check-bundle: server-only content found in client chunks: ${hits.join(", ")}`);
  process.exit(1);
}
const budgets = [
  { match: /^charts-.*\.js$/, gzipKB: 200 },
  { match: /^vendor-react-.*\.js$/, gzipKB: 200 },
  { match: /^index-.*\.js$/, gzipKB: 350 },
];
const zlib = require("zlib");
let totalGzip = 0;
for (const f of files) {
  if (!f.endsWith(".js")) continue;
  const buf = fs.readFileSync(path.join(dir, f));
  const gz = zlib.gzipSync(buf).length;
  totalGzip += gz;
  for (const b of budgets) {
    if (b.match.test(f) && gz > b.gzipKB * 1024) {
      console.error(`check-bundle: ${f} gzip ${(gz / 1024).toFixed(1)}KB exceeds budget ${b.gzipKB}KB`);
      process.exit(1);
    }
  }
}
if (totalGzip > 1024 * 1024) {
  console.error(`check-bundle: total client JS gzip ${(totalGzip / 1024).toFixed(1)}KB exceeds 1024KB`);
  process.exit(1);
}
console.log(`check-bundle: ok (no server-only chunk/content, total JS gzip ${(totalGzip / 1024).toFixed(1)}KB)`);

import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { rootDir } from "../vite.shared.ts";
import { CLIENT_OUT_DIR_NAME } from "./constants.ts";

/**
 * Vite warns above 500 KB per chunk, which is far past the point where a route chunk has already stopped being a lazy
 * win: the largest route bundle here is the Chart.js registration at ~187 KB, and the whole client ships under 1 MB.
 * This turns the size into a build error instead, so a dependency that quietly pulls its own copy of a charting or
 * parsing library fails locally rather than shipping.
 *
 * The budget is per chunk and deliberately generous against today's numbers (240 KB against a 187 KB largest chunk, ~1.3×)
 * — it is a guard against a regression, not a target to grow into.
 */
const MAX_CHUNK_BYTES = 240 * 1024;

/** Total budget for the emitted client, so many small chunks cannot add up to the same regression. */
const MAX_CLIENT_BYTES = 1024 * 1024;

interface ChunkInfo {
  fileName: string;
  bytes: number;
}

function readEmittedAssets(): ChunkInfo[] {
  const assetsDir = path.join(rootDir, CLIENT_OUT_DIR_NAME, "assets");
  const out: ChunkInfo[] = [];
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const bytes = fs.statSync(path.join(assetsDir, entry.name)).size;
    out.push({ fileName: `assets/${entry.name}`, bytes });
  }
  return out;
}

function formatKiB(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}

export function chunkBudget(): Plugin {
  return {
    name: "modeltide:chunk-budget",
    apply: "build",
    // `closeBundle` runs after Vite has written every chunk, which is the only point where the real gzip-excluded
    // sizes exist. `writeBundle` would miss files emitted by other plugins' later hooks.
    closeBundle() {
      const assets = readEmittedAssets();
      const oversized = assets.filter((asset) => asset.bytes > MAX_CHUNK_BYTES);
      if (oversized.length > 0) {
        const detail = oversized.map((a) => `  ${a.fileName}: ${formatKiB(a.bytes)}`).join("\n");
        throw new Error(
          `client chunk budget: ${oversized.length} asset(s) exceed ${formatKiB(MAX_CHUNK_BYTES)}\n${detail}\n` +
            "Split the module behind a dynamic import, or raise the budget in build/chunk-budget.ts with a reason.",
        );
      }
      const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
      if (total > MAX_CLIENT_BYTES) {
        throw new Error(
          `client total budget: dist/assets is ${formatKiB(total)}, above ${formatKiB(MAX_CLIENT_BYTES)} ` +
            `(${assets.length} files). Check what the last change added before raising the budget.`,
        );
      }
      console.log(
        `chunk:budget ok (largest ${formatKiB(Math.max(...assets.map((a) => a.bytes)))}, ` +
          `total ${formatKiB(total)} across ${assets.length} files)`,
      );
    },
  };
}

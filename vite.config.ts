import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { srcAlias } from "./vite.shared.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const clientOutDir = path.join(rootDir, "dist", "client");
const SW_VERSION_DECL = /const SW_VERSION = "[^"]*";/;
const SW_SHELL_DECL = /const PRECACHE_SHELL = \[[\s\S]*?\];/;
const SHELL_ASSET = /<(?:script|link)\b[^>]*\s(?:src|href)="(\/assets\/[^"]+)"/g;

/** Hashes emitted client asset names: CACHE_VERSION keys payloads, so it cannot rotate on a CSS tweak. */
function clientBundleVersion(): string {
  const hash = createHash("sha256");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(clientOutDir);
  for (const file of files.sort()) {
    const rel = path.relative(clientOutDir, file).replaceAll("\\", "/");
    if (rel === "sw.js") continue;
    hash.update(rel).update("\0");
    hash.update(fs.readFileSync(file)).update("\0");
  }
  return `sha-${hash.digest("hex").slice(0, 12)}`;
}

// Precaching exactly these keeps a first offline cold start off the SW's 503; the rest of the graph
// is lazy chunks that would only grow the all-or-nothing install.
function shellAssets(): string[] {
  const html = fs.readFileSync(path.join(clientOutDir, "index.html"), "utf8");
  const urls = new Set<string>();
  for (const [, url] of html.matchAll(SHELL_ASSET)) {
    if (url) urls.add(url);
  }
  if (urls.size === 0) throw new Error("dist/client/index.html: no /assets/ entry, preload or stylesheet found");
  return [...urls];
}

/** Rewrites public/sw.js to the client bundle hash and injects the shell assets Vite emitted. */
function serviceWorkerVersion(): Plugin {
  return {
    name: "modeltide:sw-version",
    apply: "build",
    closeBundle() {
      // Both environments run this hook; only the client build has dist/client/sw.js.
      if (this.environment.name !== "client") return;
      const file = path.join(clientOutDir, "sw.js");
      const source = fs.readFileSync(file, "utf8");
      if (!SW_VERSION_DECL.test(source)) {
        throw new Error(`${file}: no SW_VERSION declaration to inject`);
      }
      if (!SW_SHELL_DECL.test(source)) {
        throw new Error(`${file}: no PRECACHE_SHELL declaration to inject`);
      }
      const version = clientBundleVersion();
      const shell = `[\n  ${shellAssets()
        .map((url) => `"${url}"`)
        .join(",\n  ")},\n]`;
      fs.writeFileSync(
        file,
        source
          .replace(SW_VERSION_DECL, `const SW_VERSION = "${version}";`)
          .replace(SW_SHELL_DECL, `const PRECACHE_SHELL = ${shell};`),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorkerVersion()],
  resolve: {
    alias: srcAlias,
  },
});

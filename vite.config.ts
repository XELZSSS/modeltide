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

function clientBundleVersion(): string {
  const hash = createHash("sha256");
  const assetsDir = path.join(clientOutDir, "assets");
  for (const name of fs.readdirSync(assetsDir).sort()) {
    hash.update(name).update("\0");
    hash.update(fs.readFileSync(path.join(assetsDir, name))).update("\0");
  }
  hash.update(fs.readFileSync(path.join(clientOutDir, "index.html"))).update("\0");
  return `sha-${hash.digest("hex").slice(0, 12)}`;
}

function shellAssets(): string[] {
  const html = fs.readFileSync(path.join(clientOutDir, "index.html"), "utf8");
  const urls = new Set<string>();
  for (const [, url] of html.matchAll(SHELL_ASSET)) {
    if (url) urls.add(url);
  }
  if (urls.size === 0) throw new Error("dist/client/index.html: no /assets/ entry, preload or stylesheet found");
  return [...urls];
}

function serviceWorkerVersion(): Plugin {
  return {
    name: "modeltide:sw-version",
    apply: "build",
    closeBundle() {
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

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/;
const CSP_SCRIPT_HASH = /'sha256-([A-Za-z0-9+/=]+)'/g;

function cspHashGuard(): Plugin {
  return {
    name: "modeltide:csp-hash",
    apply: "build",
    closeBundle() {
      if (this.environment.name !== "client") return;
      const html = fs.readFileSync(path.join(clientOutDir, "index.html"), "utf8");
      const script = INLINE_SCRIPT.exec(html)?.[1];
      if (script === undefined) throw new Error("dist/client/index.html: no inline bootstrap script to check");
      const digest = createHash("sha256").update(script).digest("base64");
      const headers = fs.readFileSync(path.join(rootDir, "public", "_headers"), "utf8");
      const pinned = [...headers.matchAll(CSP_SCRIPT_HASH)].map(([, hash]) => hash);
      if (!pinned.includes(digest)) {
        throw new Error(
          `public/_headers: the inline script hashes to sha256-${digest}, but script-src pins ${pinned.join(", ") || "no sha256 source"}`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorkerVersion(), cspHashGuard()],
  resolve: {
    alias: srcAlias,
  },
});

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { CLIENT_OUT_DIR_NAME, VERSION_DIRS, VERSION_FILES } from "./constants.ts";
import { rootDir } from "../vite.shared.ts";
import { PRECACHE_URLS } from "../src/shared/pwa.ts";

const clientOutDir = path.join(rootDir, CLIENT_OUT_DIR_NAME);
const SW_VERSION_DECL = /const SW_VERSION = "[^"]*";/;
const SW_SHELL_DECL = /const PRECACHE_SHELL = \[[\s\S]*?\];/;
const SHELL_ASSET = /<(?:script|link)\b[^>]*\s(?:src|href)="(\/assets\/[^"]+)"/g;

const PRECACHE_MARKER = "// @generated-from src/shared/pwa.ts by build/sw-version.ts — do not edit by hand";
const PRECACHE_DECL = "const PRECACHE_URLS = [";
const PRECACHE_TAIL = "...PRECACHE_SHELL";
const ARRAY_END = "];";

function injectPrecacheUrls(file: string, source: string): string {
  const markerAt = source.indexOf(PRECACHE_MARKER);
  if (markerAt < 0) throw new Error(`${file}: no PRECACHE_URLS marker to inject into`);
  const openAt = source.indexOf(PRECACHE_DECL, markerAt);
  if (openAt < 0) throw new Error(`${file}: no PRECACHE_URLS declaration after the marker`);
  const bodyAt = openAt + PRECACHE_DECL.length;
  const closeAt = source.indexOf(ARRAY_END, bodyAt);
  if (closeAt < 0) throw new Error(`${file}: unterminated PRECACHE_URLS array`);
  if (!source.slice(bodyAt, closeAt).includes(PRECACHE_TAIL)) {
    throw new Error(`${file}: PRECACHE_URLS must still spread PRECACHE_SHELL`);
  }
  const entries = PRECACHE_URLS.map((url) => `  "${url}",`).join("\n");
  return `${source.slice(0, bodyAt)}\n${entries}\n  ${PRECACHE_TAIL},\n${source.slice(closeAt)}`;
}

function clientBundleVersion(): string {
  const hash = createHash("sha256");
  for (const relative of VERSION_FILES) {
    hash.update(relative).update("\0");
    hash.update(fs.readFileSync(path.join(clientOutDir, relative))).update("\0");
  }
  for (const dir of VERSION_DIRS) {
    const full = path.join(clientOutDir, dir);
    for (const name of fs.readdirSync(full).sort()) {
      hash.update(`${dir}/${name}`).update("\0");
      hash.update(fs.readFileSync(path.join(full, name))).update("\0");
    }
  }
  return `sha-${hash.digest("hex").slice(0, 12)}`;
}

function shellAssets(): string[] {
  const html = fs.readFileSync(path.join(clientOutDir, "index.html"), "utf8");
  const urls = new Set<string>();
  for (const [, url] of html.matchAll(SHELL_ASSET)) {
    if (url) urls.add(url);
  }
  if (urls.size === 0) throw new Error("dist/index.html: no /assets/ entry, preload or stylesheet found");
  return [...urls];
}

export function serviceWorkerVersion(): Plugin {
  return {
    name: "modeltide:sw-version",
    apply: "build",
    writeBundle() {
      if (this.environment?.name != null && this.environment.name !== "client") return;
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
        injectPrecacheUrls(
          file,
          source
            .replace(SW_VERSION_DECL, `const SW_VERSION = "${version}";`)
            .replace(SW_SHELL_DECL, `const PRECACHE_SHELL = ${shell};`),
        ),
      );
    },
  };
}

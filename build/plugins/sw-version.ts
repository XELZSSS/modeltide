import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { CLIENT_OUT_DIR_NAME, VERSION_DIRS, VERSION_FILES } from "../constants.ts";
import { rootDir } from "../../vite.shared.ts";

const clientOutDir = path.join(rootDir, CLIENT_OUT_DIR_NAME);
const SW_VERSION_DECL = /const SW_VERSION = "[^"]*";/;
const SW_SHELL_DECL = /const PRECACHE_SHELL = \[[\s\S]*?\];/;
const SHELL_ASSET = /<(?:script|link)\b[^>]*\s(?:src|href)="(\/assets\/[^"]+)"/g;

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
        source
          .replace(SW_VERSION_DECL, `const SW_VERSION = "${version}";`)
          .replace(SW_SHELL_DECL, `const PRECACHE_SHELL = ${shell};`),
      );
    },
  };
}

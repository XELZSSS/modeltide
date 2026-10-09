import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../src/shared/config/limits.ts";
import { THEME_COLORS } from "../src/shared/config/theme.ts";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientOutDir = path.join(rootDir, "dist");
const SW_VERSION_DECL = /const SW_VERSION = "[^"]*";/;
const SW_SHELL_DECL = /const PRECACHE_SHELL = \[[\s\S]*?\];/;
const SHELL_ASSET = /<(?:script|link)\b[^>]*\s(?:src|href)="(\/assets\/[^"]+)"/g;

const VERSION_DIRS = ["assets", "icons", "fonts"];
const VERSION_FILES = ["index.html", "manifest.webmanifest"];

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
    // writeBundle (unlike closeBundle) only fires after the client bundle is
    // on disk, and never during cleanup of a failed build.
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

const SETTINGS_KEY_READ = /localStorage\.getItem\("([^"]+)"\)/;
const SETTINGS_VERSION_CHECK = /\.version\s*===\s*(\d+)/;

const COLOR_SITES: readonly { file: string; required: readonly string[] }[] = [
  {
    file: "index.html",
    required: [
      `content="${THEME_COLORS.light}"`,
      `content="${THEME_COLORS.dark}"`,
      `dark ? "${THEME_COLORS.dark}" : "${THEME_COLORS.light}"`,
    ],
  },
  {
    file: "public/manifest.webmanifest",
    required: [`"background_color": "${THEME_COLORS.light}"`, `"theme_color": "${THEME_COLORS.light}"`],
  },
  { file: "public/styles/base.css", required: [THEME_COLORS.light, THEME_COLORS.dark] },
  {
    file: "src/styles/theme.css",
    required: [`--bg-primary: ${THEME_COLORS.light};`, `--bg-primary: ${THEME_COLORS.dark};`],
  },
];

export function consistencyGuard(): Plugin {
  return {
    name: "modeltide:consistency",
    apply: "build",
    buildStart() {
      if (this.environment?.name != null && this.environment.name !== "client") return;
      const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
      const key = SETTINGS_KEY_READ.exec(html)?.[1];
      if (key !== STORAGE_KEYS.settings) {
        throw new Error(
          `index.html: reads localStorage "${key ?? "no key"}", but the settings key is "${STORAGE_KEYS.settings}"`,
        );
      }
      const version = SETTINGS_VERSION_CHECK.exec(html)?.[1];
      if (version !== String(SETTINGS_STORAGE_VERSION)) {
        throw new Error(
          `index.html: accepts settings version ${version ?? "none"}, but the settings store persists ${SETTINGS_STORAGE_VERSION}`,
        );
      }
      for (const site of COLOR_SITES) {
        const source = fs.readFileSync(path.join(rootDir, site.file), "utf8");
        for (const required of site.required) {
          if (!source.includes(required)) {
            throw new Error(`${site.file}: missing "${required}" from THEME_COLORS in src/shared/config/theme.ts`);
          }
        }
      }
    },
  };
}

function nodeHeadersToWeb(headers: IncomingMessage["headers"]): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) out.append(key, v);
    } else {
      out.set(key, value);
    }
  }
  return out;
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 0) res.setHeader("content-length", body.length);
  res.end(body);
}

export function localApi(): Plugin {
  return {
    name: "modeltide:local-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "/";
          const url = new URL(rawUrl, "http://localhost");
          if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return next();
          const mod = (await server.ssrLoadModule("/functions/api/[[route]].ts")) as {
            onRequest: (ctx: {
              request: Request;
              env: Record<string, never>;
              waitUntil: (work: Promise<unknown>) => void;
            }) => Promise<Response>;
          };
          const request = new Request(`http://localhost${rawUrl}`, {
            method: req.method,
            headers: nodeHeadersToWeb(req.headers),
          });
          const response = await mod.onRequest({
            request,
            env: {},
            waitUntil: (work) => {
              work.catch(() => {});
            },
          });
          await writeWebResponse(response, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

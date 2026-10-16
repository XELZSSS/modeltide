import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../src/shared/config/storage.ts";
import { THEME_COLORS } from "../src/shared/config/ui.ts";
import { API_PREFIX } from "./constants.ts";
import { rootDir } from "../vite.shared.ts";

const SETTINGS_KEY_READ = /localStorage\.getItem\("([^"]+)"\)/;
const SETTINGS_VERSION_CHECK = /\.version\s*===\s*(\d+)/;

const COLOR_SITES: readonly { file: string; required: readonly string[] }[] = [
  {
    file: "index.html",
    required: [
      `content="${THEME_COLORS.light}"`,
      `content="${THEME_COLORS.dark}"`,
      `dark ? "${THEME_COLORS.dark}" : "${THEME_COLORS.light}"`,
      `background: ${THEME_COLORS.light};`,
      `background: ${THEME_COLORS.dark};`,
    ],
  },
  {
    file: "public/manifest.webmanifest",
    required: [`"background_color": "${THEME_COLORS.light}"`, `"theme_color": "${THEME_COLORS.light}"`],
  },
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
            throw new Error(`${site.file}: missing "${required}" from THEME_COLORS in src/shared/config/ui.ts`);
          }
        }
      }
      const sw = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf8");
      if (!sw.includes(`const API_PREFIX = "${API_PREFIX}"`)) {
        throw new Error(`public/sw.js: API_PREFIX drifted from build/constants.ts ("${API_PREFIX}")`);
      }
    },
  };
}

import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../src/shared/config/storage.ts";
import { THEME_COLORS } from "../src/shared/config/ui.ts";
import { FONT_STACK_MONO, FONT_STACK_SANS, normalizeFontStack } from "../src/shared/config/typography.ts";
import { API_PREFIX } from "./constants.ts";
import { rootDir } from "../vite.shared.ts";
import { FONT_FILES } from "../src/shared/pwa.ts";

const SETTINGS_KEY_READ = /localStorage\.getItem\("([^"]+)"\)/;
const SETTINGS_VERSION_CHECK = /\.version\s*===\s*(\d+)/;
const FONT_FILE_URL = /url\("(\/fonts\/[^"]+)"\)/g;
const PRELOADED_FONT = /rel="preload"[^>]*href="(\/fonts\/[^"]+)"/g;

function assertFontStack(css: string, varName: string, expected: string): void {
  const actual = new RegExp(`--${varName}:\\s*([^;]+);`).exec(css)?.[1];
  if (actual === undefined) {
    throw new Error(`src/styles/theme.css: --${varName} is missing`);
  }
  const got = normalizeFontStack(actual);
  const want = normalizeFontStack(expected);
  if (got !== want) {
    throw new Error(
      `src/styles/theme.css: --${varName} drifted from src/shared/config/typography.ts\n  stylesheet: ${got}\n  constant:   ${want}`,
    );
  }
}

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

const COMPONENTS_DIR = path.join(rootDir, "src/client/components");
const COMPONENT_GROUPS = new Set(["ui", "layout", "feedback", "navigation", "charts", "table"]);
const KEBAB_STEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_EXTENSIONS = new Set([".vue", ".ts"]);

function assertComponentLayout(): void {
  const groups = [...COMPONENT_GROUPS].join(", ");
  for (const entry of fs.readdirSync(COMPONENTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      throw new Error(`src/client/components/${entry.name}: components belong in a group directory (${groups})`);
    }
    if (!COMPONENT_GROUPS.has(entry.name)) {
      throw new Error(`src/client/components/${entry.name}: unknown group, expected one of ${groups}`);
    }
    const groupDir = path.join(COMPONENTS_DIR, entry.name);
    for (const file of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (file.isDirectory()) {
        throw new Error(`src/client/components/${entry.name}/${file.name}: groups stay flat`);
      }
      const ext = path.extname(file.name);
      if (!COMPONENT_EXTENSIONS.has(ext)) {
        throw new Error(`src/client/components/${entry.name}/${file.name}: only .vue and .ts belong here`);
      }
      const stem = file.name.slice(0, file.name.length - ext.length).split(".")[0] ?? "";
      if (!KEBAB_STEM.test(stem)) {
        throw new Error(`src/client/components/${entry.name}/${file.name}: "${stem}" is not kebab-case`);
      }
    }
  }
}

/**
 * The same font file list lives in three places (the `@font-face` rules, `FONT_FILES` for the service worker
 * precache, and the `<link rel="preload">` hints). Only two of those are typed, so adding a weight in one place
 * used to break offline loading silently.
 */
function assertFontFiles(html: string): void {
  const css = fs.readFileSync(path.join(rootDir, "src/styles/globals.css"), "utf8");
  const declared = new Set<string>();
  for (const match of css.matchAll(FONT_FILE_URL)) declared.add(match[1]!);
  const expected = new Set<string>(FONT_FILES);
  const missing = [...expected].filter((file) => !declared.has(file));
  const extra = [...declared].filter((file) => !expected.has(file));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      "src/styles/globals.css: @font-face files drifted from FONT_FILES in src/shared/pwa.ts" +
        `\n  missing: ${missing.join(", ") || "none"}` +
        `\n  unexpected: ${extra.join(", ") || "none"}`,
    );
  }
  const preloaded = new Set<string>();
  for (const match of html.matchAll(PRELOADED_FONT)) preloaded.add(match[1]!);
  const unknown = [...preloaded].filter((file) => !expected.has(file));
  if (unknown.length > 0) {
    throw new Error(`index.html: preloads a font that FONT_FILES does not declare: ${unknown.join(", ")}`);
  }
}

export function consistencyGuard(): Plugin {
  let ran = false;
  return {
    name: "modeltide:consistency",
    // Applies to `vite dev` as well as `vite build`: neither type-check nor lint evaluates these rules, so a
    // violation used to stay invisible until a production build ran.
    buildStart() {
      if (ran) return;
      if (this.environment?.name != null && this.environment.name !== "client") return;
      ran = true;
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
      const themeCss = fs.readFileSync(path.join(rootDir, "src/styles/theme.css"), "utf8");
      assertFontStack(themeCss, "font-sans", FONT_STACK_SANS);
      assertFontStack(themeCss, "font-mono", FONT_STACK_MONO);
      assertComponentLayout();
      assertFontFiles(html);
    },
  };
}

import { CHART_PALETTE, DONUT_PALETTE, MOBILE_MAX_WIDTH_PX, THEME_COLORS } from "../../src/shared/config/ui.ts";
import { FONT_STACK_MONO, FONT_STACK_SANS, normalizeFontStack } from "../../src/shared/config/typography.ts";
import { FONT_FILES } from "../../src/shared/pwa.ts";
import type { GuardContext, GuardRule } from "./context.ts";

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

const CHART_PALETTE_GROUPS: readonly { prefix: string; constant: string; colors: readonly string[] }[] = [
  { prefix: "chart", constant: "CHART_PALETTE", colors: CHART_PALETTE },
  { prefix: "donut", constant: "DONUT_PALETTE", colors: DONUT_PALETTE },
];

/**
 * Chart colours are read from CSS custom properties at runtime, so the `:root` declarations are what the Canvas
 * fallback in src/client/charts/theme.ts has to agree with. Only `:root` is checked: `.dark` overrides the same
 * variables in CSS alone, and every dark value differs from its light counterpart per index.
 */
function assertChartPalette(css: string): void {
  for (const { prefix, constant, colors } of CHART_PALETTE_GROUPS) {
    colors.forEach((color, index) => {
      const declaration = `--${prefix}-${index + 1}: ${color};`;
      if (!css.includes(declaration)) {
        throw new Error(`src/styles/theme.css: "${declaration}" does not match ${constant} in src/shared/config/ui.ts`);
      }
    });
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

/**
 * The font file list lives in three places (the `@font-face` rules, `FONT_FILES` for the service-worker precache, and
 * the `<link rel="preload">` hints). Only two are typed, so adding a weight in one place would break offline loading
 * silently — hence this check.
 */
function assertFontFiles(html: string, css: string): void {
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

/**
 * The phone/tablet boundary exists twice: as `MOBILE_MAX_WIDTH_PX` in the `matchMedia` string that picks which
 * navigation and which table body render, and as a media query in the stylesheet that decides how a sheet enters. A
 * stylesheet cannot import a constant, so this is the one place that can hold the pair together — and it is the check
 * the comment linking the two files could never enforce.
 *
 * `scrollbar.css` used to be half of this pair. It no longer has a width-dependent rule at all: the bar is hidden at
 * every width (see that file), so there is no boundary left in it to drift.
 */
function assertMobileBreakpoint(motionCss: string): void {
  const wide = `${MOBILE_MAX_WIDTH_PX + 1}px`;
  for (const query of [`(width < ${wide})`, `(width >= ${wide})`]) {
    if (!motionCss.includes(query)) {
      throw new Error(
        `src/styles/motion.css: no "@media ${query}" rule, but src/client/device.ts reads the phone boundary from ` +
          `MOBILE_MAX_WIDTH_PX = ${MOBILE_MAX_WIDTH_PX} (src/shared/config/ui.ts), which is one pixel inside ${wide}`,
      );
    }
  }
}

/**
 * Every colour the UI paints enters through `src/styles/theme.css`, and three of those values are also constants the
 * TypeScript side reads at runtime (the theme colours in the html and the manifest, the chart scale, the font stacks).
 * A copy in either direction is invisible to types: the stylesheet cannot import a TS constant and a Canvas fallback
 * cannot read a CSS file.
 */
export const tokensRule: GuardRule = {
  id: "tokens",
  watches: [
    "index.html",
    "public/manifest.webmanifest",
    "src/styles/theme.css",
    "src/styles/globals.css",
    "src/styles/motion.css",
    "src/shared/config/ui.ts",
    "src/shared/config/typography.ts",
    "src/shared/pwa.ts",
    "src/client/device.ts",
  ],
  run(ctx: GuardContext) {
    const html = ctx.readText("index.html");
    for (const site of COLOR_SITES) {
      const source = ctx.readText(site.file);
      for (const required of site.required) {
        if (!source.includes(required)) {
          throw new Error(`${site.file}: missing "${required}" from THEME_COLORS in src/shared/config/ui.ts`);
        }
      }
    }
    const themeCss = ctx.readText("src/styles/theme.css");
    assertFontStack(themeCss, "font-sans", FONT_STACK_SANS);
    assertFontStack(themeCss, "font-mono", FONT_STACK_MONO);
    assertChartPalette(themeCss);
    assertFontFiles(html, ctx.readText("src/styles/globals.css"));
    assertMobileBreakpoint(ctx.readText("src/styles/motion.css"));
  },
};

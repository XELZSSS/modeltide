import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../src/shared/config/storage.ts";
import { CHART_PALETTE, DONUT_PALETTE, THEME_COLORS } from "../src/shared/config/ui.ts";
import { FONT_STACK_MONO, FONT_STACK_SANS, normalizeFontStack } from "../src/shared/config/typography.ts";
import { API_PREFIX } from "./constants.ts";
import { rootDir } from "../vite.shared.ts";
import { FONT_FILES } from "../src/shared/pwa.ts";
import { NEWS_LEG_CONCURRENCY, rssFeeds } from "../src/server/news/feeds.ts";
import {
  INFLIGHT_HANG_GUARD_MARGIN_MS,
  INFLIGHT_HANG_GUARD_MS,
  PLATFORM_WAIT_UNTIL_CAP_MS,
} from "../src/server/upstream/timeouts.ts";
import { NEWS_CATEGORIES } from "../src/shared/types/news.ts";

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
 * The font file list lives in three places (the `@font-face` rules, `FONT_FILES` for the service-worker precache, and
 * the `<link rel="preload">` hints). Only two are typed, so adding a weight in one place would break offline loading
 * silently — hence this check.
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

/**
 * Each news category has to finish its feeds in one leg round: one round costs at most 22 s (2 × 10 s + backoff), inside
 * INFLIGHT_HANG_GUARD_MS (28 s), while a second round would reach 44 s and make the hang guard drop a refresh whose
 * upstream work was already paid for. Failing here keeps that a build error instead of a boot-time failure for every
 * route.
 */
function assertNewsRoundBudget(): void {
  for (const category of NEWS_CATEGORIES) {
    const count = rssFeeds[category].length;
    if (count > NEWS_LEG_CONCURRENCY) {
      throw new Error(
        `src/server/news/feeds.ts: "${category}" lists ${count} feeds, but NEWS_LEG_CONCURRENCY is ${NEWS_LEG_CONCURRENCY}: ` +
          "a second leg round would exceed INFLIGHT_HANG_GUARD_MS. Raise the limit and re-check the timeout budget " +
          "in src/server/upstream/timeouts.ts together.",
      );
    }
  }
}

/**
 * The inflight hang guard releases a wedged refresh, and it only ever runs if it fires inside the platform's
 * post-response window (`ctx.waitUntil`, 30 s). The budget arithmetic lives in src/server/upstream/timeouts.ts; raising a
 * fetch timeout there is what would quietly push the guard past the cap, which no test would see.
 */
function assertHangGuardBudget(): void {
  if (INFLIGHT_HANG_GUARD_MS + INFLIGHT_HANG_GUARD_MARGIN_MS > PLATFORM_WAIT_UNTIL_CAP_MS) {
    const slack = PLATFORM_WAIT_UNTIL_CAP_MS - INFLIGHT_HANG_GUARD_MS;
    throw new Error(
      `src/server/upstream/timeouts.ts: the inflight hang guard fires ${slack} ms before the platform's ` +
        `${PLATFORM_WAIT_UNTIL_CAP_MS} ms waitUntil cap, inside the ${INFLIGHT_HANG_GUARD_MARGIN_MS} ms margin it keeps. ` +
        "Lower the fetch timeout budget or the guard stops running at all.",
    );
  }
}

/**
 * Pages parses `public/_headers`, `public/_redirects` and `public/_routes.json` itself, at deploy time; Vite only
 * copies them. A malformed block, a rule count past the documented limit or a redirect that reaches into the API
 * prefix is therefore invisible to type-check and lint, and surfaces as a production 404 instead. The security-header
 * ban is AGENTS.md's first rule, and nothing else enforced it.
 */
const SECURITY_HEADER_NAMES =
  /^(?:content-security-policy(?:-report-only)?|x-frame-options|x-content-type-options|referrer-policy|strict-transport-security|permissions-policy|feature-policy|cross-origin-(?:opener|embedder|resource)-policy|x-xss-protection)$/i;

/** Documented Pages limits: platform/limits (headers, redirects) and functions/routing (invocation routes). */
const HEADERS_MAX_RULES = 100;
const HEADERS_MAX_LINE_CHARS = 2000;
const ROUTES_MAX_RULES = 100;
const ROUTES_MAX_RULE_CHARS = 100;
const REDIRECTS_MAX_STATIC = 2000;
const REDIRECTS_MAX_DYNAMIC = 100;

interface PagesFileLine {
  /** The line with surrounding whitespace removed. */
  text: string;
  /** Both `_headers` and `_redirects` use leading whitespace to mean "attached to the line above". */
  indented: boolean;
}

function pagesFileLines(file: string): PagesFileLine[] {
  const lines: PagesFileLine[] = [];
  for (const raw of fs.readFileSync(path.join(rootDir, file), "utf8").split("\n")) {
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) continue;
    lines.push({ text, indented: /^\s/.test(raw) });
  }
  return lines;
}

function assertPagesHeaders(): void {
  const lines = pagesFileLines("public/_headers");
  let rules = 0;
  for (const { text, indented } of lines) {
    if (!indented) rules += 1;
    if (text.length > HEADERS_MAX_LINE_CHARS) {
      throw new Error(
        `public/_headers: a line is ${text.length} chars, above the ${HEADERS_MAX_LINE_CHARS} Pages limit`,
      );
    }
    // `! Name` detaches a header, and the name is what decides whether this is one of the banned ones.
    const name = /^!?\s*([A-Za-z0-9-]+)\s*:/.exec(text)?.[1];
    if (name !== undefined && SECURITY_HEADER_NAMES.test(name)) {
      throw new Error(
        `public/_headers: "${name}" is a security/policy header, which this repository deliberately does not send - ` +
          "Cloudflare Pages owns the edge policy. See AGENTS.md.",
      );
    }
  }
  if (rules > HEADERS_MAX_RULES) {
    throw new Error(`public/_headers: ${rules} rules, above the ${HEADERS_MAX_RULES} Pages limit`);
  }
}

function assertPagesRoutes(): void {
  const routes = JSON.parse(fs.readFileSync(path.join(rootDir, "public/_routes.json"), "utf8")) as {
    version: number;
    include: string[];
    exclude: string[];
  };
  if (routes.version !== 1) {
    throw new Error(`public/_routes.json: version ${routes.version}, expected 1`);
  }
  if (routes.include.length === 0) {
    throw new Error(
      "public/_routes.json: at least one include rule is required - with none, Pages invokes a Function for every " +
        "request, so static assets stop being free and unlimited",
    );
  }
  const rules = [...routes.include, ...routes.exclude];
  if (rules.length > ROUTES_MAX_RULES) {
    throw new Error(`public/_routes.json: ${rules.length} rules, above the ${ROUTES_MAX_RULES} Pages limit`);
  }
  for (const rule of rules) {
    if (!rule.startsWith("/")) {
      throw new Error(`public/_routes.json: "${rule}" is not an absolute path rule`);
    }
    if (rule.length > ROUTES_MAX_RULE_CHARS) {
      throw new Error(`public/_routes.json: "${rule}" is longer than the ${ROUTES_MAX_RULE_CHARS} character limit`);
    }
  }
  // Every invoked route has to sit under the API prefix: an include rule on a page path makes that page run through a
  // Function, which is exactly what this file exists to prevent.
  const stray = routes.include.filter((rule) => !rule.startsWith(`${API_PREFIX}/`));
  if (stray.length > 0) {
    throw new Error(
      `public/_routes.json: include rule(s) outside "${API_PREFIX}/": ${stray.join(", ")} - a page path that invokes ` +
        "a Function is exactly what this file exists to prevent",
    );
  }
}

function assertPagesRedirects(): void {
  const lines = pagesFileLines("public/_redirects");
  let dynamic = 0;
  for (const { text } of lines) {
    const [from, to, code] = text.split(/\s+/);
    if (from === undefined || to === undefined) {
      throw new Error(`public/_redirects: "${text}" is not a "source destination [code]" rule`);
    }
    // Pages applies `_redirects` while serving the static side of the request, so a rule that reaches into the API
    // prefix answers an /api URL with the SPA shell instead of letting `functions/api/` handle it.
    if (from === API_PREFIX || from.startsWith(`${API_PREFIX}/`) || from.startsWith(`${API_PREFIX}*`)) {
      throw new Error(`public/_redirects: "${from}" would answer an API URL with the SPA shell`);
    }
    if (code !== undefined && !/^[1-9]\d\d$/.test(code)) {
      throw new Error(`public/_redirects: "${text}" has status "${code}", expected a three-digit code`);
    }
    if (from.includes("*") || from.includes(":")) dynamic += 1;
  }
  const staticCount = lines.length - dynamic;
  if (staticCount > REDIRECTS_MAX_STATIC || dynamic > REDIRECTS_MAX_DYNAMIC) {
    throw new Error(
      `public/_redirects: ${staticCount} static and ${dynamic} dynamic rules, above the ` +
        `${REDIRECTS_MAX_STATIC}/${REDIRECTS_MAX_DYNAMIC} Pages limits`,
    );
  }
}

/** Pads each segment so a plain string comparison orders `10.0.0` above `9.0.0`. */
function paddedVersion(version: string): string {
  return version
    .split(".")
    .map((part) => part.padStart(6, "0"))
    .join(".");
}

/**
 * The Pages v3 build image ships Node 22.16.0 and cannot read `engines.node` - a documented v3 limitation - so the
 * version this project needs only reaches the build through `.nvmrc` / `.node-version`. `.npmrc` sets `engine-strict`,
 * which turns a mismatch into a failed install with an obscure message; asserting the floor here names both files.
 */
function assertBuildNodeVersion(): void {
  const read = (file: string): string => fs.readFileSync(path.join(rootDir, file), "utf8").trim();
  const nvmrc = read(".nvmrc");
  const nodeVersion = read(".node-version");
  if (nvmrc !== nodeVersion) {
    throw new Error(`.nvmrc (${nvmrc}) and .node-version (${nodeVersion}) disagree, and Pages reads both`);
  }
  const engines = (
    JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as { engines?: { node?: string } }
  ).engines?.node;
  const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(engines ?? "")?.[1];
  if (floor === undefined) {
    throw new Error(`package.json: engines.node "${engines ?? "none"}" is not of the form ">=X.Y.Z"`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(nvmrc)) {
    throw new Error(`.nvmrc: "${nvmrc}" is not of the form X.Y.Z, which the Pages build image needs`);
  }
  if (paddedVersion(nvmrc) < paddedVersion(floor)) {
    throw new Error(`.nvmrc pins Node ${nvmrc}, below the ${engines ?? ""} floor in package.json`);
  }
}

/**
 * Paths whose change invalidates a rule. The layout rule is different: it cares about any file appearing, moving or
 * disappearing under `src/client/components`, so that tree is matched by prefix instead of by a fixed path.
 */
const COMPONENTS_PREFIX = "src/client/components/";

const WATCHED_FILES = new Set([
  "index.html",
  "public/sw.js",
  "public/manifest.webmanifest",
  "src/styles/theme.css",
  "src/styles/globals.css",
  "src/shared/config/ui.ts",
  "src/shared/config/typography.ts",
  "src/shared/config/storage.ts",
  "src/shared/pwa.ts",
  "src/server/news/feeds.ts",
  "src/shared/config/sites.ts",
  "src/shared/utils/models.ts",
  "src/client/router/paths.ts",

  "public/_headers",
  "public/_routes.json",
  "public/_redirects",
  ".nvmrc",
  ".node-version",
  "package.json",
]);

/** The rules, extracted so both hooks can run them: a build runs them once, dev re-runs them per rebuild. */
function checkConsistency(): void {
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
  assertChartPalette(themeCss);
  assertComponentLayout();
  assertFontFiles(html);
  assertNewsRoundBudget();
  assertHangGuardBudget();

  assertPagesHeaders();
  assertPagesRoutes();
  assertPagesRedirects();
  assertBuildNodeVersion();
  assertCpuBudgetShape();
  assertUrlOwners();
}

/**
 * The parsing optimisations that keep a cold invocation inside the Workers CPU budget are not observable from types or
 * tests: a refactor can quietly restore the expensive shape and only production shows it, as Error 1102. These are the
 * three that mattered, each measured against real upstream payloads.
 */
function assertCpuBudgetShape(): void {
  const read = (file: string): string => fs.readFileSync(path.join(rootDir, file), "utf8");

  // 1. RSS: parse only the items that can still be reached, and keep article bodies opaque. Without either, one refresh
  //    of a full news category (a 30-row shelf over feeds that ship hundreds of items with full article bodies) exceeds
  //    the whole CPU budget.
  const feed = read("src/server/formats/rss-feed-parser.ts");
  if (!feed.includes("parser.parse(capItems(")) {
    throw new Error(
      "src/server/formats/rss-feed-parser.ts: capItems() is gone. Parsing every item of a long feed (a full-text feed " +
        "can ship hundreds for a 30-item limit) costs ~19 ms of a 10 ms CPU budget.",
    );
  }
  if (!feed.includes("stopNodes")) {
    throw new Error(
      "src/server/formats/rss-feed-parser.ts: the stopNodes entry for content:encoded is gone. Building a subtree for " +
        "article bodies the code never reads adds ~3 ms per news refresh.",
    );
  }

  // 2. The RSC unescaper must stay a manual scan: the regex form allocated a match result per escape and cost 13 ms on a
  //    1.9 MB body, where the loop costs 5.6 ms.
  const scan = read("src/server/formats/rsc-scan.ts");
  if (scan.includes("EMBEDDED_ESCAPE_RE")) {
    throw new Error(
      "src/server/formats/rsc-scan.ts: unescapeEmbedded went back to a regex replace. It allocates a match result per " +
        "escape; the manual loop beside it is ~2.3x faster on a multi-MB body with the same output.",
    );
  }

  // 3. The catalog merge must not copy every row before it knows the row is patched.
  const merge = read("src/server/aa/parse/model-merge.ts");
  if (/bySlug\.set\([^)]*\{ \.\.\.raw \}/.test(merge)) {
    throw new Error(
      "src/server/aa/parse/model-merge.ts: mergeBySlug is spreading every catalog row again. Only rows that receive an " +
        "enrichment patch are mutated, so the copy belongs in the second phase (~1.8 ms saved per AA refresh).",
    );
  }
}

/**
 * Every URL the app ships has exactly one owner. `ClosedReleaseEntry.link` used to be assembled by hand from the release
 * slug instead of the model slug, and every row it produced pointed at a page that answered 404 — a wrong string that no
 * type, lint rule or unit test can see, and the second such URL is one `+=` away. A hand-built URL, a hand-built route,
 * or a second place that assembles the AA model page now fails the build instead.
 */
const EXTERNAL_URL_LITERAL = /["'`]https?:\/\//;
const ROUTE_LITERAL = /["'`]\/(?:model|models|compare|price-compare|releases|news)(?=[/"'`?#]|$)/;
const AA_MODEL_PAGE = "/models/";
/** The site table owns the roots; the feed list owns the publishers it subscribes to. */
const URL_OWNERS = new Set(["src/shared/config/sites.ts", "src/server/news/feeds.ts"]);
/** `paths.ts` owns the routes; `models.ts` owns the model-detail path and the AA model page built beside it. */
const ROUTE_OWNERS = new Set(["src/client/router/paths.ts", "src/shared/utils/models.ts"]);
const AA_PAGE_OWNER = "src/shared/utils/models.ts";
const URL_SCAN_ROOTS = ["src/client", "src/shared", "src/server"];
const ROUTE_SCANNED_PREFIXES = ["src/client/", "src/shared/"];
const SCANNED_EXTENSIONS = new Set([".ts", ".vue"]);

function scannedSources(): { rel: string; src: string }[] {
  const sources: { rel: string; src: string }[] = [];
  for (const root of URL_SCAN_ROOTS) {
    for (const entry of fs.readdirSync(path.join(rootDir, root), { recursive: true })) {
      const rel = `${root}/${String(entry).replaceAll("\\", "/")}`;
      if (rel.endsWith(".test.ts") || !SCANNED_EXTENSIONS.has(path.extname(rel))) continue;
      sources.push({ rel, src: fs.readFileSync(path.join(rootDir, rel), "utf8") });
    }
  }
  return sources;
}

function assertUrlOwners(): void {
  for (const { rel, src } of scannedSources()) {
    if (!URL_OWNERS.has(rel) && EXTERNAL_URL_LITERAL.test(src)) {
      throw new Error(
        `${rel}: an http(s) URL literal belongs in src/shared/config/sites.ts (the site table) or ` +
          "src/server/news/feeds.ts (the feed list). A URL assembled from a literal is how the release rows came to point " +
          "at the release slug instead of the model page, and answer 404.",
      );
    }
    if (rel !== AA_PAGE_OWNER && src.includes(AA_MODEL_PAGE)) {
      throw new Error(
        `${rel}: "${AA_MODEL_PAGE}" is assembled in ${AA_PAGE_OWNER} (aaModelPageUrl). A second place that builds the AA ` +
          "model page is how the release rows came to use the release slug, which answers 404 for the releases whose two " +
          "slugs differ.",
      );
    }
    if (!ROUTE_SCANNED_PREFIXES.some((prefix) => rel.startsWith(prefix)) || ROUTE_OWNERS.has(rel)) continue;
    const hit = ROUTE_LITERAL.exec(src);
    if (hit) {
      throw new Error(
        `${rel}: route literal ${hit[0]} belongs in src/client/router/paths.ts (PATHS) or src/shared/utils/models.ts ` +
          "(modelDetailPath). A hand-built internal URL is the other half of the same 404 class.",
      );
    }
  }
}

export function consistencyGuard(): Plugin {
  let ranBuild = false;
  return {
    name: "modeltide:consistency",
    // Applies to `vite dev` as well as `vite build`: neither type-check nor lint evaluates these rules, so otherwise a
    // violation stays invisible until a production build runs. A build checks once — the inputs cannot change mid-build.
    buildStart() {
      if (ranBuild) return;
      if (this.environment?.name != null && this.environment.name !== "client") return;
      ranBuild = true;
      checkConsistency();
    },
    /**
     * Dev re-checks on change. The rules read `theme.css`, `globals.css`, `index.html`, `sw.js` and the component tree,
     * none of which are modules the client graph imports, so a `buildStart`-only check left a running dev server
     * validating the files it started with. Failures are logged rather than thrown: the dev server has to stay up so the
     * fix can be made in place.
     */
    configureServer(server) {
      server.watcher.on("all", (_event, file) => {
        const rel = path.relative(rootDir, file).replaceAll("\\", "/");
        if (!WATCHED_FILES.has(rel) && !rel.startsWith(COMPONENTS_PREFIX)) return;
        try {
          checkConsistency();
        } catch (err) {
          server.config.logger.error(`[consistency] ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
  };
}

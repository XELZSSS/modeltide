import {
  BACKOFF_MAX_MS,
  INFLIGHT_HANG_GUARD_MARGIN_MS,
  INFLIGHT_HANG_GUARD_MS,
  NETWORK_RETRY_BACKOFF_MS,
  PLATFORM_WAIT_UNTIL_CAP_MS,
} from "../../src/server/upstream/timeouts.ts";
import { listDir, listDirRecursive, type GuardContext, type GuardRule } from "./context.ts";

const COMPONENTS_DIR = "src/client/components";
const COMPONENT_GROUPS = new Set(["ui", "layout", "feedback", "navigation", "charts", "table"]);
const KEBAB_STEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_EXTENSIONS = new Set([".vue", ".ts"]);

/** `src/client/components` is six flat groups; a component that needs a group of its own is about a page, and page-local components belong under `src/client/pages`. */
function assertComponentLayout(ctx: GuardContext): void {
  const groups = [...COMPONENT_GROUPS].join(", ");
  for (const entry of listDir(ctx.rootDir, COMPONENTS_DIR)) {
    if (!entry.isDirectory()) {
      throw new Error(`${COMPONENTS_DIR}/${entry.name}: components belong in a group directory (${groups})`);
    }
    if (!COMPONENT_GROUPS.has(entry.name)) {
      throw new Error(`${COMPONENTS_DIR}/${entry.name}: unknown group, expected one of ${groups}`);
    }
    for (const file of listDir(ctx.rootDir, `${COMPONENTS_DIR}/${entry.name}`)) {
      if (file.isDirectory()) {
        throw new Error(`${COMPONENTS_DIR}/${entry.name}/${file.name}: groups stay flat`);
      }
      const ext = file.name.slice(file.name.lastIndexOf("."));
      if (!COMPONENT_EXTENSIONS.has(ext)) {
        throw new Error(`${COMPONENTS_DIR}/${entry.name}/${file.name}: only .vue and .ts belong here`);
      }
      const stem = file.name.slice(0, file.name.length - ext.length).split(".")[0] ?? "";
      if (!KEBAB_STEM.test(stem)) {
        throw new Error(`${COMPONENTS_DIR}/${entry.name}/${file.name}: "${stem}" is not kebab-case`);
      }
    }
  }
}

/**
 * The guard only runs if it fires inside the platform's post-response window (`ctx.waitUntil`); the numbers are
 * imported from src/server/upstream/timeouts.ts rather than parsed out of the text, and the check is on the *slack* left
 * after it fires.
 */
function assertWaitUntilBudget(): void {
  // `WORST_CASE_UPSTREAM_CALL_MS` in timeouts.ts adds exactly one `BACKOFF_MAX_MS`, so a retry wait above that cap would push a call past the refresh timeout.
  if (NETWORK_RETRY_BACKOFF_MS > BACKOFF_MAX_MS) {
    throw new Error(
      `src/server/upstream/timeouts.ts: NETWORK_RETRY_BACKOFF_MS (${NETWORK_RETRY_BACKOFF_MS}) is above BACKOFF_MAX_MS ` +
        `(${BACKOFF_MAX_MS}), which WORST_CASE_UPSTREAM_CALL_MS is derived from.`,
    );
  }
  const slack = PLATFORM_WAIT_UNTIL_CAP_MS - INFLIGHT_HANG_GUARD_MS;
  if (slack < INFLIGHT_HANG_GUARD_MARGIN_MS) {
    throw new Error(
      `src/server/upstream/timeouts.ts: the inflight hang guard fires at ${INFLIGHT_HANG_GUARD_MS} ms, leaving ${slack} ms ` +
        `before the platform's ${PLATFORM_WAIT_UNTIL_CAP_MS} ms waitUntil cap — under the ` +
        `${INFLIGHT_HANG_GUARD_MARGIN_MS} ms the timer needs to run at all. Lower the fetch timeout budget or the guard ` +
        "stops running.",
    );
  }
}

/**
 * The CPU-budget parsing optimisations are not observable from types or tests: a refactor can quietly restore the
 * expensive shape and only production shows it. Three shapes matter, and each guard below pins one.
 */
function assertCpuBudgetShape(ctx: GuardContext): void {
  // 1. RSS: parse only the items that can still be reached, and keep article bodies opaque, or one refresh of a full
  //    news category (a 30-row shelf over feeds shipping hundreds of full bodies) exceeds the whole CPU budget.
  const feed = ctx.readText("src/server/formats/rss-feed-parser.ts");
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

  // 2. The RSC unescaper must stay a manual scan: the regex form allocates a match result per escape, where the loop walks the string once.
  const scan = ctx.readText("src/server/formats/rsc-scan.ts");
  if (scan.includes("EMBEDDED_ESCAPE_RE")) {
    throw new Error(
      "src/server/formats/rsc-scan.ts: unescapeEmbedded went back to a regex replace. It allocates a match result per " +
        "escape; the manual loop beside it is ~2.3x faster on a multi-MB body with the same output.",
    );
  }

  // 3. The catalog merge must not copy every row before it knows the row is patched.
  const merge = ctx.readText("src/server/aa/parse/model-merge.ts");
  if (/bySlug\.set\([^)]*\{ \.\.\.raw \}/.test(merge)) {
    throw new Error(
      "src/server/aa/parse/model-merge.ts: mergeBySlug is spreading every catalog row again. Only rows that receive an " +
        "enrichment patch are mutated, so the copy belongs in the second phase (~1.8 ms saved per AA refresh).",
    );
  }
}

/**
 * Every URL the app ships has exactly one owner. A hand-built URL, a hand-built route or a second place that assembles
 * the AA model page fails the build: that is the class of wrong string no type, lint rule or unit test can see.
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

function scannedSources(ctx: GuardContext): { rel: string; src: string }[] {
  const sources: { rel: string; src: string }[] = [];
  for (const root of URL_SCAN_ROOTS) {
    for (const entry of listDirRecursive(ctx.rootDir, root)) {
      const rel = `${root}/${entry.replaceAll("\\", "/")}`;
      if (rel.endsWith(".test.ts") || !SCANNED_EXTENSIONS.has(rel.slice(rel.lastIndexOf(".")))) continue;
      sources.push({ rel, src: ctx.readText(rel) });
    }
  }
  return sources;
}

function assertUrlOwners(ctx: GuardContext): void {
  for (const { rel, src } of scannedSources(ctx)) {
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

/**
 * `src/client/components`' six flat groups, the waitUntil budget the hang guard has to land inside, and the CPU-budget
 * shapes the parsers must keep. The parsers are read as text rather than imported: a `src/server` import would pull a
 * Workers-only tree into the DOM-typed app project (`tsconfig.app.json` includes `build/**`).
 */
export const structureRule: GuardRule = {
  id: "structure",
  watches: [
    "src/server/formats/rss-feed-parser.ts",
    "src/server/formats/rsc-scan.ts",
    "src/server/aa/parse/model-merge.ts",
    "src/shared/config/sites.ts",
    "src/shared/utils/models.ts",
    "src/client/router/paths.ts",
  ],
  watchesPrefix: `${COMPONENTS_DIR}/`,
  run(ctx: GuardContext) {
    assertComponentLayout(ctx);
    assertWaitUntilBudget();
    assertCpuBudgetShape(ctx);
    assertUrlOwners(ctx);
  },
};

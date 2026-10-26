import { NEWS_CATEGORIES } from "../../src/shared/types/news.ts";
import { listDir, listDirRecursive, type GuardContext, type GuardRule } from "./context.ts";

const COMPONENTS_DIR = "src/client/components";
const COMPONENT_GROUPS = new Set(["ui", "layout", "feedback", "navigation", "charts", "table"]);
const KEBAB_STEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_EXTENSIONS = new Set([".vue", ".ts"]);

/**
 * `src/client/components` is six flat groups. The rule is mechanical on purpose: a component that needs a group of its
 * own is a component that is about a page, and page-local components belong under `src/client/pages`.
 */
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

/** `export const NEWS_LEG_CONCURRENCY = <number>;`, read as text: importing `feeds.ts` would pull a Workers-only tree
 * into the DOM-typed app project (see the note on `readGuardSource` in the old guard file). */
const NEWS_LEG_CONCURRENCY_DECL = /export const NEWS_LEG_CONCURRENCY = (\d+);/;
const FEED_CATEGORY_BLOCK = /^  (\w+): \[/gm;

function feedCountPerCategory(feedsSrc: string): Map<string, number> {
  const counts = new Map<string, number>();
  const starts = [...feedsSrc.matchAll(FEED_CATEGORY_BLOCK)];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!.index;
    const to = i + 1 < starts.length ? starts[i + 1]!.index : feedsSrc.length;
    const block = feedsSrc.slice(from, to);
    counts.set(starts[i]![1]!, (block.match(/url: /g) ?? []).length);
  }
  return counts;
}

/**
 * One leg round per news category, and a round is a timeout budget rather than only latency: `FEED_TIMEOUT_MS ×
 * (retries + 1) + backoff` per round has to stay inside `INFLIGHT_HANG_GUARD_MS`. A category that lists more feeds than
 * the round can carry would need a second round, which reaches 44 s — past the guard, so the refresh would be dropped
 * after the upstream work was already paid for.
 */
function assertNewsRoundBudget(feedsSrc: string): void {
  const limit = NEWS_LEG_CONCURRENCY_DECL.exec(feedsSrc)?.[1];
  if (limit === undefined) {
    throw new Error("src/server/news/feeds.ts: NEWS_LEG_CONCURRENCY declaration not found");
  }
  const concurrency = Number(limit);
  const counts = feedCountPerCategory(feedsSrc);
  for (const category of NEWS_CATEGORIES) {
    const count = counts.get(category);
    if (count === undefined) {
      throw new Error(`src/server/news/feeds.ts: rssFeeds has no "${category}" list`);
    }
    if (count > concurrency) {
      throw new Error(
        `src/server/news/feeds.ts: "${category}" lists ${count} feeds, but NEWS_LEG_CONCURRENCY is ${concurrency}: ` +
          "a second leg round would exceed INFLIGHT_HANG_GUARD_MS. Raise the limit and re-check the timeout budget " +
          "in src/server/upstream/timeouts.ts together.",
      );
    }
  }
}

/** The numbers `assertHangGuardBudget` compares, parsed from `src/server/upstream/timeouts.ts` for the reason above. */
const TIMEOUT_CONSTANTS = [
  "UPSTREAM_TIMEOUT_MS",
  "FEED_TIMEOUT_MS",
  "BACKOFF_MAX_MS",
  "NETWORK_RETRY_BACKOFF_MS",
  "PLATFORM_WAIT_UNTIL_CAP_MS",
  "INFLIGHT_HANG_GUARD_MARGIN_MS",
] as const;

function timeoutNumbers(src: string): Record<(typeof TIMEOUT_CONSTANTS)[number], number> {
  const out = {} as Record<(typeof TIMEOUT_CONSTANTS)[number], number>;
  for (const name of TIMEOUT_CONSTANTS) {
    // `UPSTREAM_TIMEOUT_MS` is module-private (no `export`), so the pattern accepts both forms.
    const digits = new RegExp(`(?:export )?const ${name} = ([\\d_]+);`).exec(src)?.[1];
    if (digits === undefined) throw new Error(`src/server/upstream/timeouts.ts: ${name} declaration not found`);
    out[name] = Number(digits.replaceAll("_", ""));
  }
  return out;
}

/**
 * The inflight hang guard releases a wedged refresh, and it only ever runs if it fires inside the platform's
 * post-response window (`ctx.waitUntil`, 30 s). The budget arithmetic lives in src/server/upstream/timeouts.ts; raising a
 * fetch timeout there is what would quietly push the guard past the cap, which no test would see.
 *
 * The check is on the *slack* left after the guard fires, not on the guard plus its margin: the old form passed while
 * leaving exactly zero room for the timer, so a fetch-budget change could eat the last second unnoticed.
 */
function assertHangGuardBudget(src: string): void {
  const t = timeoutNumbers(src);
  const worstCaseCall = Math.max(t.UPSTREAM_TIMEOUT_MS * 2, t.FEED_TIMEOUT_MS * 2) + t.BACKOFF_MAX_MS;
  // `WORST_CASE_UPSTREAM_CALL_MS` in timeouts.ts adds exactly one `BACKOFF_MAX_MS` to `timeoutMs × (retries + 1)`, so a
  // retry wait above that backoff cap would push a call past the refresh timeout the guard is derived from.
  if (t.NETWORK_RETRY_BACKOFF_MS > t.BACKOFF_MAX_MS) {
    throw new Error(
      `src/server/upstream/timeouts.ts: NETWORK_RETRY_BACKOFF_MS (${t.NETWORK_RETRY_BACKOFF_MS}) is above BACKOFF_MAX_MS ` +
        `(${t.BACKOFF_MAX_MS}), which WORST_CASE_UPSTREAM_CALL_MS is derived from.`,
    );
  }
  const guard = worstCaseCall + t.INFLIGHT_HANG_GUARD_MARGIN_MS;
  const slack = t.PLATFORM_WAIT_UNTIL_CAP_MS - guard;
  if (slack < t.INFLIGHT_HANG_GUARD_MARGIN_MS) {
    throw new Error(
      `src/server/upstream/timeouts.ts: the inflight hang guard fires at ${guard} ms, leaving ${slack} ms before the ` +
        `platform's ${t.PLATFORM_WAIT_UNTIL_CAP_MS} ms waitUntil cap — under the ${t.INFLIGHT_HANG_GUARD_MARGIN_MS} ms ` +
        "the timer needs to run at all. Lower the fetch timeout budget or the guard stops running.",
    );
  }
}

/**
 * The parsing optimisations that keep a cold invocation inside the Workers CPU budget are not observable from types or
 * tests: a refactor can quietly restore the expensive shape and only production shows it, as Error 1102. These are the
 * three that mattered, each measured against real upstream payloads.
 */
function assertCpuBudgetShape(ctx: GuardContext): void {
  // 1. RSS: parse only the items that can still be reached, and keep article bodies opaque. Without either, one refresh
  //    of a full news category (a 30-row shelf over feeds that ship hundreds of items with full article bodies) exceeds
  //    the whole CPU budget.
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

  // 2. The RSC unescaper must stay a manual scan: the regex form allocated a match result per escape and cost 13 ms on a
  //    1.9 MB body, where the loop costs 5.6 ms.
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
 * `src/client/components`' six flat groups, plus the three budget rules that only a build can see: the news leg round,
 * the hang guard's slack under `waitUntil`, and the CPU-budget shapes the parsers must keep. All three read server
 * sources as text rather than importing them: a `src/server` import would pull a Workers-only tree into the DOM-typed
 * app project (`tsconfig.app.json` includes `build/**`).
 */
export const structureRule: GuardRule = {
  id: "structure",
  watches: [
    "src/server/news/feeds.ts",
    "src/server/upstream/timeouts.ts",
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
    assertNewsRoundBudget(ctx.readText("src/server/news/feeds.ts"));
    assertHangGuardBudget(ctx.readText("src/server/upstream/timeouts.ts"));
    assertCpuBudgetShape(ctx);
    assertUrlOwners(ctx);
  },
};

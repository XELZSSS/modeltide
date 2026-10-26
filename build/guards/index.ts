import { API_PREFIX } from "../constants.ts";
import { createGuardContext, type GuardRule } from "./context.ts";
import { apiLayersRule } from "./api-layers.ts";
import { firstPaintRule } from "./first-paint.ts";
import { pagesRule, runtimeRule } from "./pages.ts";
import { structureRule } from "./structure.ts";
import { tokensRule } from "./tokens.ts";

/**
 * Every consistency rule, in the order they run. The order is only a report order — each rule is independent — so a
 * new rule belongs wherever it reads best.
 *
 * The set is split by what a rule is *about* rather than by size: the first paint's contract, the token/palette mirror,
 * the repository's structural and budget rules, and the three files Cloudflare Pages parses at deploy time. A rule
 * declares the files whose change invalidates it, so `configureServer` no longer keeps a second hand-maintained list.
 */
export const GUARD_RULES: readonly GuardRule[] = [
  firstPaintRule,
  tokensRule,
  structureRule,
  apiLayersRule,
  pagesRule(API_PREFIX),
  runtimeRule,
];

/** Every watched path across all rules, plus the directory prefixes a rule cares about as a whole tree. */
export const GUARD_WATCHES = {
  files: new Set(GUARD_RULES.flatMap((rule) => rule.watches)),
  prefixes: GUARD_RULES.flatMap((rule) => (rule.watchesPrefix === undefined ? [] : [rule.watchesPrefix])),
};

/**
 * Runs every rule against a fresh read of the working tree.
 *
 * A new context per call is what keeps the dev server honest: `configureServer` re-runs this on every watched change,
 * so a cache shared across runs would validate the files the server started with — the exact failure the guard exists
 * to prevent.
 */
export function checkConsistency(rootDir: string): void {
  const ctx = createGuardContext(rootDir);
  for (const rule of GUARD_RULES) rule.run(ctx);
}

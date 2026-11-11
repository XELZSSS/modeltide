import { API_PREFIX } from "../constants.ts";
import { classesRule } from "./classes.ts";
import { createGuardContext, type GuardRule } from "./context.ts";
import { pagesRule, runtimeRule } from "./pages.ts";
import { structureRule } from "./structure.ts";
import { tokensRule } from "./tokens.ts";
import { testsRule } from "./tests.ts";

/**
 * Every consistency rule, in the order they run; the order is only a report order, so a new rule belongs wherever it
 * reads best. Each rule declares the files whose change invalidates it, so the watcher set is their union.
 */
const GUARD_RULES: readonly GuardRule[] = [
  tokensRule,
  classesRule,
  structureRule,
  pagesRule(API_PREFIX),
  runtimeRule,
  testsRule,
];

/** Every watched path across all rules, plus the directory prefixes a rule cares about as a whole tree. */
export const GUARD_WATCHES = {
  files: new Set(GUARD_RULES.flatMap((rule) => rule.watches)),
  prefixes: GUARD_RULES.flatMap((rule) => (rule.watchesPrefix === undefined ? [] : [rule.watchesPrefix])),
};

/**
 * Runs every rule against a fresh read of the working tree: a context per call is what keeps the dev server honest,
 * since `configureServer` re-runs this on every watched change.
 */
export function checkConsistency(rootDir: string): void {
  const ctx = createGuardContext(rootDir);
  for (const rule of GUARD_RULES) rule.run(ctx);
}

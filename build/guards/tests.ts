import { listDirRecursive, type GuardContext, type GuardRule } from "./context.ts";

/**
 * The Vitest file set, frozen at its current size (AGENTS.md rule 3): "never add a `*.test.ts`" was restated in three
 * places and none of them could fail, so naming the files makes the rule mechanical in both directions - a suite added
 * *or* deleted fails here. The list is spelled out rather than derived from a count, so changing it is a deliberate edit.
 */
const FROZEN_TEST_FILES: readonly string[] = [
  "src/client/api/decode/payload.test.ts",
  "src/client/api/query/partial-poll.test.ts",
  "src/client/components/table/paging.test.ts",
  "src/client/components/table/use-row-list.test.ts",
  "src/client/hooks/use-compare-models.test.ts",
  "src/client/pages/compare/cost-inputs.test.ts",
  "src/client/pages/rankings/provider-stats.test.ts",
  "src/client/search/match.test.ts",
  "src/client/search/search-rank.test.ts",
  "src/client/stores/search-store.test.ts",
  "src/server/aa/parse/parsers.test.ts",
  "src/server/api/errors.test.ts",
  "src/server/api/headers.test.ts",
  "src/server/api/router.test.ts",
  "src/server/api/validation.test.ts",
  "src/server/cache/service.test.ts",
  "src/server/cache/store.test.ts",
  "src/server/fan-out.test.ts",
  "src/server/formats/parsers.test.ts",
  "src/server/huggingface/parse.test.ts",
  "src/server/join-legs.test.ts",
  "src/server/openrouter/parse-directory.test.ts",
  "src/server/openrouter/parse-rankings.test.ts",
  "src/server/openrouter/wire.test.ts",
  "src/server/upstream/client.test.ts",
  "src/server/upstream/pools.test.ts",
  "src/server/upstream/retry.test.ts",
  "src/shared/config/time.test.ts",
  "src/shared/utils/cost.test.ts",
  "src/shared/utils/money.test.ts",
  "src/shared/utils/number.test.ts",
  "src/shared/utils/pricing.test.ts",
  "src/shared/utils/text.test.ts",
  "src/shared/utils/url.test.ts",
];

/** The two shapes `vitest.config.ts` includes, so a `*.spec.ts` cannot slip past the list by using the other suffix. */
const TEST_FILE_RE = /\.(?:test|spec)\.ts$/;

function assertFrozenTestFiles(ctx: GuardContext): void {
  const found = listDirRecursive(ctx.rootDir, "src")
    .map((rel) => `src/${rel.replaceAll("\\", "/")}`)
    .filter((rel) => TEST_FILE_RE.test(rel));
  const frozen = new Set(FROZEN_TEST_FILES);
  const added = found.filter((rel) => !frozen.has(rel));
  if (added.length > 0) {
    throw new Error(
      `${added.join(", ")}: the Vitest file set is frozen at ${FROZEN_TEST_FILES.length} files. Add the coverage to an ` +
        "existing suite, or extend src/test/fixtures.ts — a new *.test.ts / *.spec.ts is a deliberate edit of " +
        "build/guards/tests.ts. See AGENTS.md rule 3.",
    );
  }
  const missing = FROZEN_TEST_FILES.filter((rel) => !found.includes(rel));
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")}: listed as part of the frozen Vitest file set but not found. Deleting a suite is the same ` +
        "deliberate edit as adding one; update build/guards/tests.ts and AGENTS.md rule 3 together.",
    );
  }
}

/**
 * The frozen suite list. It watches the whole `src` tree: a suite is added by creating a file, so a rule naming only
 * the current files would never re-run on the change that violates it.
 */
export const testsRule: GuardRule = {
  id: "tests",
  watches: ["build/guards/tests.ts"],
  watchesPrefix: "src/",
  run(ctx: GuardContext) {
    assertFrozenTestFiles(ctx);
  },
};

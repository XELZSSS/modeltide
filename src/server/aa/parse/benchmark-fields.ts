import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";

/**
 * The benchmark wire names, in one table.
 *
 * The value is the field name the upstream uses for that evaluation, decided per key: the three projections below
 * (`LEADERBOARD_BENCHMARK_KEYS`, `MODELS_BENCHMARK_WIRE_NAMES`, `OMNISCIENCE_BENCHMARK_WIRE_NAMES`) and every reader of
 * a projected row derive from it, so the tables cannot disagree about what a benchmark is called.
 *
 * `satisfies Record<BenchmarkKey, string>` is the part that prevents drift: adding a key to `BENCHMARK_KEYS` was
 * previously a silent no-op (the old `overrides[key] ?? key` fallback filed it under its camelCase key, which no page
 * sends), and it is now a compile error until its wire spelling is stated here. Listing the identity names explicitly
 * is the price of that guarantee, and it is what makes this table the single definition instead of a patch list.
 */
const BENCHMARK_WIRE_NAMES = {
  gpqa: "gpqa",
  hle: "hle",
  hle_diamond: "hleDiamond",
  gdpval: "gdpval",
  gdp_pdf: "gdpPdfAllPass",
  scicode: "scicode",
  ifbench: "ifbench",
  lcr: "lcr",
  tau2: "tau2",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_v4_0: "terminalBench40",
  terminalbench_science: "terminalBenchScience",
  critpt: "critpt",
  critpt_v2_hard: "critptAgenticHard",
  frontiercode_2_0: "frontierCode20",
  apex_agents: "apexAgents",
  briefcase_elo: "briefcaseElo",
  itbench_sre: "itbenchSre",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
  omniscience: "omniscience",
} as const satisfies Record<BenchmarkKey, string>;

/** Every spelling a projected AA row may carry a benchmark under — the keys `AaRow` accepts. */
export type BenchmarkWireName = (typeof BENCHMARK_WIRE_NAMES)[BenchmarkKey];

export function benchmarkWireName(key: BenchmarkKey): BenchmarkWireName {
  return BENCHMARK_WIRE_NAMES[key];
}

/**
 * The three benchmark lists differ only by which keys they leave out, so the leaves are written as differences
 * against `BENCHMARK_KEYS` instead of as three hand-copied key lists: a copied list is the failure this file already
 * documents — a key missing from one copy silently drops the metric from that projection, and `missingFields` in
 * `aa/fetch.ts` cannot see it (it only warns when a whole page lacks a field).
 */
const LEADERBOARD_EXCLUDED = new Set<BenchmarkKey>(["cyber_index", "deepsec_bench", "cwe_bench"]);

/** `/models` also leaves out the Briefcase Elo, which only the leaderboard and omniscience pages score. */
const MODELS_EXCLUDED = new Set<BenchmarkKey>([...LEADERBOARD_EXCLUDED, "briefcase_elo"]);

export const LEADERBOARD_BENCHMARK_KEYS: readonly BenchmarkKey[] = BENCHMARK_KEYS.filter(
  (key) => !LEADERBOARD_EXCLUDED.has(key),
);

/**
 * Benchmark key → the key it is filed under in the leaderboard row's `scores` object. The leaderboard ships its values
 * there under the upstream's kebab-case evaluation names — not the camelCase fields the /models page exposes — and
 * reading the camelCase names off the row found nothing, silently dropping every benchmark for the ~245 models the
 * enrichment pages do not cover. This table is the only place that translation lives.
 *
 * `omniscience` has no entry: the signed index stays a top-level field on the row, so `benchmarkValue` reads it there.
 */
const SCORE_KEY_TABLE = {
  gpqa: "gpqa-diamond",
  hle: "humanitys-last-exam",
  hle_diamond: "hle-diamond",
  gdpval: "gdpval-aa-normalized",
  gdp_pdf: "gdp-pdf",
  scicode: "scicode",
  ifbench: "ifbench",
  lcr: "artificial-analysis-long-context-reasoning",
  tau2: "tau2-bench",
  tau_banking: "tau3-banking",
  terminalbench_v2_1: "terminalbench-2-1",
  terminalbench_hard: "terminalbench-hard",
  terminalbench_v4_0: "terminalbench-4-0",
  terminalbench_science: "terminal-bench-science",
  critpt: "critpt",
  critpt_v2_hard: "critpt-v2-hard",
  frontiercode_2_0: "frontiercode-2-0",
  apex_agents: "apex-agents-aa",
  briefcase_elo: "aa-briefcase",
  itbench_sre: "itbench-aa",
  mmmu_pro: "mmmu-pro",
  automation_bench: "automationbench-aa",
} as const satisfies Partial<Record<BenchmarkKey, string>>;

/** A spelling that only exists inside the leaderboard's `scores` object, never on a projected row. */
export type LeaderboardScoreKey = (typeof SCORE_KEY_TABLE)[keyof typeof SCORE_KEY_TABLE];

/**
 * The same table, typed as a lookup keyed by `BenchmarkKey`: `omniscience` is deliberately absent, so an indexed read
 * answers `undefined` for it instead of forcing every caller to narrow the const's key set by hand.
 */
export const LEADERBOARD_SCORE_KEYS: Partial<Record<BenchmarkKey, LeaderboardScoreKey>> = SCORE_KEY_TABLE;

// `gdpval` is included: the upstream retired `gdpvalNormalized` and now ships the Elo itself (e.g. 1586.76) with a
// `gdpvalInterval`. It is declared absolute in `ABSOLUTE_SCORE_BENCHMARKS`, so `compact` keeps the Elo instead of
// running it through `ratioScore`.
const MODELS_BENCHMARKS: readonly BenchmarkKey[] = BENCHMARK_KEYS.filter((key) => !MODELS_EXCLUDED.has(key));

export const modelsBenchmarkWireNames: readonly BenchmarkWireName[] = MODELS_BENCHMARKS.map(benchmarkWireName);
// `BENCHMARK_KEYS` is the omniscience page's field list: it scores every benchmark, including the three security
// evaluations the leaderboard's `scores` object omits.
export const omniscienceBenchmarkWireNames: readonly BenchmarkWireName[] = BENCHMARK_KEYS.map(benchmarkWireName);

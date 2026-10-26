import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  apex_agents: "apexAgents",
  automation_bench: "automationBenchPartialScore",
  briefcase_elo: "briefcaseElo",
  critpt_v2_hard: "critptAgenticHard",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  frontiercode_2_0: "frontierCode20",
  gdp_pdf: "gdpPdfAllPass",
  hle_diamond: "hleDiamond",
  itbench_sre: "itbenchSre",
  mmmu_pro: "mmmuPro",
  tau_banking: "tauBanking",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_science: "terminalBenchScience",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_v4_0: "terminalBench40",
};

const FIELD_ALIASES: Record<string, readonly string[]> = {
  itbenchSre: ["itbenchSre", "itBenchSre"],
};

export function fieldAliases(field: string): readonly string[] {
  return FIELD_ALIASES[field] ?? [field];
}

/**
 * Called once per benchmark field per row, so it deliberately skips `fieldAliases`: that built a one-element array
 * for every field without an alias, which is all but one of them.
 */
export function presentAlias(row: Record<string, unknown>, field: string): string | undefined {
  const aliases = FIELD_ALIASES[field];
  if (aliases === undefined) return field in row ? field : undefined;
  return aliases.find((alias) => alias in row);
}

export function benchmarkWireName(key: BenchmarkKey): string {
  return BENCHMARK_FIELD_OVERRIDES[key] ?? key;
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
 * `omniscience` has no entry: the signed index stays a top-level field, and `benchmarkValue` falls back to the row.
 */
export const LEADERBOARD_SCORE_KEYS: Partial<Record<BenchmarkKey, string>> = {
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
};

// `gdpval` is included: the upstream retired `gdpvalNormalized` and now ships the Elo itself (e.g. 1586.76) with a
// `gdpvalInterval`. It is declared absolute in `ABSOLUTE_SCORE_BENCHMARKS`, so `compact` keeps the Elo instead of
// running it through `ratioScore`.
const MODELS_BENCHMARKS: readonly BenchmarkKey[] = BENCHMARK_KEYS.filter((key) => !MODELS_EXCLUDED.has(key));

export const modelsBenchmarkWireNames = MODELS_BENCHMARKS.map(benchmarkWireName);
// `BENCHMARK_KEYS` is the omniscience page's field list: it scores every benchmark, including the three security
// evaluations the leaderboard's `scores` object omits.
export const omniscienceBenchmarkWireNames = BENCHMARK_KEYS.map(benchmarkWireName);

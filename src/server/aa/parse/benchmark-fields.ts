import type { BenchmarkKey } from "@/shared/config";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  apex_agents: "apexAgents",
  automation_bench: "automationBenchPartialScore",
  briefcase_elo: "briefcaseElo",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  gdpval: "gdpvalNormalized",
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

const LEADERBOARD_BENCHMARKS = [
  "gpqa",
  "hle",
  "gdpval",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "critpt",
  "apex_agents",
  "itbench_sre",
  "mmmu_pro",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

// `gdpval` is deliberately missing: on the /models page that key carries the raw GDPval Elo (e.g. 1586.76) with a
// `gdpvalInterval`, not the 0-1 ratio the leaderboard exports as `gdpvalNormalized`. Expecting it here projected a
// field that either landed on the wrong scale or was dropped by `ratioScore`, and reported a permanent drift warning.
const MODELS_BENCHMARKS = [
  "gpqa",
  "hle",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "terminalbench_science",
  "critpt",
  "apex_agents",
  "itbench_sre",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

const OMNISCIENCE_BENCHMARKS = [
  "gpqa",
  "hle",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "terminalbench_science",
  "critpt",
  "apex_agents",
  "briefcase_elo",
  "itbench_sre",
  "cwe_bench",
  "cyber_index",
  "deepsec_bench",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

export const leaderboardBenchmarkWireNames = LEADERBOARD_BENCHMARKS.map(benchmarkWireName);
export const modelsBenchmarkWireNames = MODELS_BENCHMARKS.map(benchmarkWireName);
export const omniscienceBenchmarkWireNames = OMNISCIENCE_BENCHMARKS.map(benchmarkWireName);

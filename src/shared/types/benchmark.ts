export const BENCHMARK_KEYS = [
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
  "automation_bench",
  "omniscience",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

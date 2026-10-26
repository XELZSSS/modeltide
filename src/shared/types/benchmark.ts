/**
 * The evaluations this app carries. Where Artificial Analysis publishes two runs of the same evaluation — HLE and
 * HLE-Diamond, CritPt and CritPt v2 (Hard), GDPval and GDP.pdf, FrontierCode and FrontierCode 2.0 — both keys are
 * carried: the upstream scores models on either, and a model is not guaranteed to have the newer run.
 */
export const BENCHMARK_KEYS = [
  "gpqa",
  "hle",
  "hle_diamond",
  "gdpval",
  "gdp_pdf",
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
  "critpt_v2_hard",
  "frontiercode_2_0",
  "apex_agents",
  "briefcase_elo",
  "itbench_sre",
  "cwe_bench",
  "cyber_index",
  "deepsec_bench",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

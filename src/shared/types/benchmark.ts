/**
 * The evaluations this app carries. Where Artificial Analysis publishes two runs of the same evaluation — HLE and
 * HLE-Diamond, CritPt and CritPt v2 (Hard), GDPval and GDP.pdf, FrontierCode and FrontierCode 2.0 — both keys are
 * carried: the upstream scores models on either, and a model is not guaranteed to have the newer run.
 *
 * The last two are not pass-rate evaluations at all: Code2Video and AA-3D are Elo ladders for the generation ladders
 * (video and 3D), which is why they sit in their own group and are declared absolute in
 * `src/shared/config/benchmarks.ts` rather than read as 0-1 ratios.
 */
export const BENCHMARK_KEYS = [
  "gpqa",
  "hle",
  "hle_diamond",
  "aime_2025",
  "gdpval",
  "gdp_pdf",
  "scicode",
  "livecodebench",
  "ifbench",
  "lcr",
  "mlcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "terminalbench_science",
  "critpt",
  "critpt_v2_hard",
  "frontiercode_2_0",
  "frontiercode",
  "apex_agents",
  "briefcase_elo",
  "itbench_sre",
  "cwe_bench",
  "cyber_index",
  "deepsec_bench",
  "mmmu_pro",
  "automation_bench",
  "enterprise_ops_gym",
  "healthbench",
  "healthbench_professional",
  "harvey_lab",
  "omniscience",
  "code2video_elo",
  "aa_3d",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

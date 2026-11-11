/**
 * The evaluations this app carries. Where AA publishes two runs of the same evaluation (HLE and HLE-Diamond, CritPt and
 * CritPt v2, GDPval and GDP.pdf, FrontierCode and 2.0) both keys are carried, since a model may lack the newer run. The
 * last two are Elo ladders (Code2Video, AA-3D), which is why they sit in their own group and are declared absolute.
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
  "mka",
  "vials",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

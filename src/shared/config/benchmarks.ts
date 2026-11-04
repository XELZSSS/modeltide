import type { TranslationKey } from "@/shared/i18n";
import type { BenchmarkKey } from "@/shared/types/benchmark";

/**
 * Benchmarks whose upstream value is already on its own scale and is kept exactly as sent: Briefcase Elo (832-1817), the
 * Cyber index (12-56, a 0-100 style score), GDPval, which the upstream now ships as an Elo (~1000-1900, negative for the
 * weakest rows) after retiring the 0-1 `gdpvalNormalized` field, omniscience, a *signed* index (down to about -89 for
 * models that hallucinate more than they know), and the two generation ladders, Code2Video (303-1536) and AA-3D
 * (573-1199). Verified against the live leaderboard, /models and /evaluations/omniscience payloads: every other benchmark
 * arrives as a 0-1 ratio.
 */
export const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>([
  "briefcase_elo",
  "cyber_index",
  "gdpval",
  "omniscience",
  "code2video_elo",
  "aa_3d",
]);

/**
 * How a benchmark value is scaled inside `ArtificialAnalysisModel.benchmarks`.
 *
 * One record carries two scales — `ratio` values are the upstream 0-1 number as sent, `index` ones keep their own range
 * (Elo around 1500, a signed omniscience index) — so anything that formats, plots or compares a benchmark has to branch
 * on the scale instead of assuming one. `benchmarkScaleOf` decides, and nothing is rescaled on the way in.
 */
type BenchmarkScale = "ratio" | "index";

export function benchmarkScaleOf(key: string): BenchmarkScale {
  return ABSOLUTE_SCORE_BENCHMARKS.has(key as BenchmarkKey) ? "index" : "ratio";
}

export const BENCHMARK_LABELS: Record<BenchmarkKey, TranslationKey> = {
  gpqa: "benchmarkGpqa",
  hle: "benchmarkHle",
  hle_diamond: "benchmarkHleDiamond",
  aime_2025: "benchmarkAime2025",
  gdpval: "benchmarkGdpval",
  gdp_pdf: "benchmarkGdpPdf",
  scicode: "benchmarkScicode",
  livecodebench: "benchmarkLivecodebench",
  ifbench: "benchmarkIfbench",
  lcr: "benchmarkLcr",
  mlcr: "benchmarkMlcr",
  tau2: "benchmarkTau2",
  tau_banking: "benchmarkTauBanking",
  terminalbench_v2_1: "benchmarkTerminalbenchV2_1",
  terminalbench_hard: "benchmarkTerminalbenchHard",
  terminalbench_v4_0: "benchmarkTerminalbenchV4_0",
  terminalbench_science: "benchmarkTerminalbenchScience",
  critpt: "benchmarkCritpt",
  critpt_v2_hard: "benchmarkCritptV2Hard",
  frontiercode_2_0: "benchmarkFrontiercode2_0",
  frontiercode: "benchmarkFrontiercode",
  apex_agents: "benchmarkApexAgents",
  briefcase_elo: "benchmarkBriefcaseElo",
  itbench_sre: "benchmarkItbenchSre",
  cwe_bench: "benchmarkCweBench",
  cyber_index: "benchmarkCyberIndex",
  deepsec_bench: "benchmarkDeepsecBench",
  mmmu_pro: "benchmarkMmmuPro",
  automation_bench: "benchmarkAutomationBench",
  enterprise_ops_gym: "benchmarkEnterpriseOpsGym",
  healthbench: "benchmarkHealthbench",
  healthbench_professional: "benchmarkHealthbenchProfessional",
  harvey_lab: "benchmarkHarveyLab",
  omniscience: "benchmarkOmniscience",
  code2video_elo: "benchmarkCode2videoElo",
  aa_3d: "benchmarkAa3dElo",
};

/**
 * The headings the benchmark grid sorts its columns under, in display order. A heading says what the evaluations in it
 * measure, so a reader can tell a code-agent score from a safety one without knowing each acronym.
 */
export type BenchmarkGroupId = "knowledge" | "coding" | "terminal" | "safety" | "generation";

export const BENCHMARK_GROUPS: readonly { readonly id: BenchmarkGroupId; readonly labelKey: TranslationKey }[] = [
  { id: "knowledge", labelKey: "benchmarkGroupKnowledge" },
  { id: "coding", labelKey: "benchmarkGroupCoding" },
  { id: "terminal", labelKey: "benchmarkGroupTerminal" },
  { id: "safety", labelKey: "benchmarkGroupSafety" },
  { id: "generation", labelKey: "benchmarkGroupGeneration" },
];

/**
 * The heading each benchmark is filed under. A total record over `BenchmarkKey` on purpose: a benchmark added without
 * filing it here would silently disappear from the grid, which is the one mistake this table has to make impossible.
 */
export const BENCHMARK_GROUP_OF: Record<BenchmarkKey, BenchmarkGroupId> = {
  gpqa: "knowledge",
  hle: "knowledge",
  hle_diamond: "knowledge",
  gdpval: "knowledge",
  gdp_pdf: "knowledge",
  omniscience: "knowledge",
  mmmu_pro: "knowledge",
  lcr: "knowledge",
  ifbench: "knowledge",
  briefcase_elo: "knowledge",
  aime_2025: "knowledge",
  healthbench: "knowledge",
  healthbench_professional: "knowledge",
  harvey_lab: "knowledge",
  mlcr: "knowledge",
  scicode: "coding",
  critpt: "coding",
  critpt_v2_hard: "coding",
  frontiercode_2_0: "coding",
  apex_agents: "coding",
  itbench_sre: "coding",
  automation_bench: "coding",
  tau2: "coding",
  tau_banking: "coding",
  livecodebench: "coding",
  enterprise_ops_gym: "coding",
  frontiercode: "coding",
  terminalbench_v2_1: "terminal",
  terminalbench_hard: "terminal",
  terminalbench_v4_0: "terminal",
  terminalbench_science: "terminal",
  cwe_bench: "safety",
  cyber_index: "safety",
  deepsec_bench: "safety",
  code2video_elo: "generation",
  aa_3d: "generation",
};

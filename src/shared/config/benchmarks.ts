import type { TranslationKey } from "@/shared/i18n";
import type { BenchmarkKey } from "@/shared/types/benchmark";

/**
 * Benchmarks whose upstream value is already on its own scale and is kept exactly as sent: Briefcase Elo, the Cyber index,
 * GDPval, omniscience (a *signed* index), Code2Video and AA-3D. Every other benchmark arrives as a 0-1 ratio.
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
 * How a benchmark value is scaled inside `ArtificialAnalysisModel.benchmarks`: `ratio` values are the upstream 0-1
 * number as sent, `index` ones keep their own range (an Elo ladder, a signed omniscience index), and nothing is
 * rescaled on the way in - so `benchmarkScaleOf` decides and every formatter, plot and comparison branches on the scale.
 */
type BenchmarkScale = "ratio" | "index";

export function benchmarkScaleOf(key: string): BenchmarkScale {
  return ABSOLUTE_SCORE_BENCHMARKS.has(key as BenchmarkKey) ? "index" : "ratio";
}

/** The badge AA prints beside an evaluation, mirrored from its own `type`/`removeAfter` map; re-sync when AA flags another evaluation. */
export interface BenchmarkNotice {
  kind: "new" | "underReview";
  /** Last day the badge is shown (AA's `removeAfter`), ISO `YYYY-MM-DD`. */
  until?: string;
}

const BENCHMARK_NOTICES: Partial<Record<BenchmarkKey, BenchmarkNotice>> = {
  mka: { kind: "new", until: "2026-11-24" },
  vials: { kind: "new", until: "2026-11-20" },
  scicode: { kind: "underReview" },
};

export function benchmarkNoticeOf(key: BenchmarkKey, today: string): BenchmarkNotice | undefined {
  const notice = BENCHMARK_NOTICES[key];
  if (notice?.until === undefined) return notice;
  return today > notice.until ? undefined : notice;
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
  mka: "benchmarkMka",
  vials: "benchmarkVials",
};

/** The headings the benchmark grid sorts its columns under, in display order. */
export type BenchmarkGroupId = "knowledge" | "coding" | "terminal" | "safety" | "generation";

export const BENCHMARK_GROUPS: readonly { readonly id: BenchmarkGroupId; readonly labelKey: TranslationKey }[] = [
  { id: "knowledge", labelKey: "benchmarkGroupKnowledge" },
  { id: "coding", labelKey: "benchmarkGroupCoding" },
  { id: "terminal", labelKey: "benchmarkGroupTerminal" },
  { id: "safety", labelKey: "benchmarkGroupSafety" },
  { id: "generation", labelKey: "benchmarkGroupGeneration" },
];

/** The heading each benchmark is filed under; a total record over `BenchmarkKey`, so an unfiled one cannot disappear from the grid. */
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
  mka: "knowledge",
  vials: "knowledge",
};

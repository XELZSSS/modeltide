import type { TranslationKey } from "@/shared/i18n";
import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/types/benchmark";

export { BENCHMARK_KEYS, type BenchmarkKey };

/**
 * Benchmarks whose upstream value is already on its own scale and must not be run through `ratioToPercent`:
 * Briefcase Elo (832-1817), the Cyber index (12-56, a 0-100 style score) and omniscience, which is a *signed* index
 * (down to about -89 for models that hallucinate more than they know). Verified against the live leaderboard,
 * /models and /evaluations/omniscience payloads: every other benchmark arrives as a 0-1 ratio.
 */
export const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>(["briefcase_elo", "cyber_index", "omniscience"]);

export const BENCHMARK_LABELS: Record<BenchmarkKey, TranslationKey> = {
  gpqa: "benchmarkGpqa",
  hle: "benchmarkHle",
  gdpval: "benchmarkGdpval",
  scicode: "benchmarkScicode",
  ifbench: "benchmarkIfbench",
  lcr: "benchmarkLcr",
  tau2: "benchmarkTau2",
  tau_banking: "benchmarkTauBanking",
  terminalbench_v2_1: "benchmarkTerminalbenchV2_1",
  terminalbench_hard: "benchmarkTerminalbenchHard",
  terminalbench_v4_0: "benchmarkTerminalbenchV4_0",
  terminalbench_science: "benchmarkTerminalbenchScience",
  critpt: "benchmarkCritpt",
  apex_agents: "benchmarkApexAgents",
  briefcase_elo: "benchmarkBriefcaseElo",
  itbench_sre: "benchmarkItbenchSre",
  cwe_bench: "benchmarkCweBench",
  cyber_index: "benchmarkCyberIndex",
  deepsec_bench: "benchmarkDeepsecBench",
  mmmu_pro: "benchmarkMmmuPro",
  automation_bench: "benchmarkAutomationBench",
  omniscience: "benchmarkOmniscience",
};

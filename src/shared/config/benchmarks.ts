import type { TranslationKey } from "@/shared/i18n";
import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/types/benchmark";

export { BENCHMARK_KEYS, type BenchmarkKey };

// Benchmarks whose live value is already an absolute score rather than a 0-1
// ratio, verified against the 2026-10 payloads: briefcaseElo ranges 832-1817
// and cyberIndex 12.7-56.4, so both must skip the ratio->percent conversion.
// gdpval used to be listed here too, but gdpvalNormalized actually spans
// 0.00-0.68 — the same scale as gpqa/hle — and was rendering as a fraction of
// one percent, so it now goes through the normal percent conversion.
export const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>(["briefcase_elo", "cyber_index"]);

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

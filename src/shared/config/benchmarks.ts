import type { TranslationKey } from "@/shared/i18n";
import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/types/benchmark";

export { BENCHMARK_KEYS, type BenchmarkKey };

export const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>(["gdpval"]);

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
  critpt: "benchmarkCritpt",
  apex_agents: "benchmarkApexAgents",
  itbench_sre: "benchmarkItbenchSre",
  mmmu_pro: "benchmarkMmmuPro",
  automation_bench: "benchmarkAutomationBench",
  omniscience: "benchmarkOmniscience",
};

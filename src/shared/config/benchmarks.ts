import type { TranslationKey } from "@/shared/i18n";

export const BENCHMARK_KEYS = [
  "aime25",
  "gpqa",
  "hle",
  "mmlu_pro",
  "livecodebench",
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
  "math500",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

export const BENCHMARK_LABELS: Record<BenchmarkKey, TranslationKey> = {
  aime25: "benchmarkAime25",
  gpqa: "benchmarkGpqa",
  hle: "benchmarkHle",
  mmlu_pro: "benchmarkMmluPro",
  livecodebench: "benchmarkLivecodebench",
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
  math500: "benchmarkMath500",
  mmmu_pro: "benchmarkMmmuPro",
  automation_bench: "benchmarkAutomationBench",
  omniscience: "benchmarkOmniscience",
};

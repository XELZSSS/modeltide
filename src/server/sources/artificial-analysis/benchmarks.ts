import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";
import { num } from "@/server/parsers/primitives";

/** Upstream field names that differ from the benchmark key; all other keys map 1:1. */
const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalbenchV21",
  apex_agents: "apexAgents",
};

export function compactBenchmarks(m: Record<string, unknown>): Record<string, number | null> {
  const benchmarks: Record<string, number | null> = {};
  for (const key of BENCHMARK_KEYS) benchmarks[key] = num(m[BENCHMARK_FIELD_OVERRIDES[key] ?? key]);
  return benchmarks;
}

import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";

/**
 * The benchmark wire names, in one table: the value is the field name the upstream uses for that evaluation, and every
 * projection below derives from it. `satisfies Record<BenchmarkKey, string>` makes a key added to `BENCHMARK_KEYS` a
 * compile error until its wire spelling is stated here.
 */
const BENCHMARK_WIRE_NAMES = {
  gpqa: "gpqa",
  hle: "hle",
  hle_diamond: "hleDiamond",
  aime_2025: "aime25",
  gdpval: "gdpval",
  gdp_pdf: "gdpPdfAllPass",
  scicode: "scicode",
  livecodebench: "livecodebench",
  ifbench: "ifbench",
  lcr: "lcr",
  mlcr: "mlcrOverall",
  tau2: "tau2",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_v4_0: "terminalBench40",
  terminalbench_science: "terminalBenchScience",
  critpt: "critpt",
  critpt_v2_hard: "critptAgenticHard",
  frontiercode_2_0: "frontierCode20",
  frontiercode: "frontierCode",
  apex_agents: "apexAgents",
  briefcase_elo: "briefcaseElo",
  itbench_sre: "itbenchSre",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
  enterprise_ops_gym: "enterpriseOpsGym",
  healthbench: "healthbench",
  healthbench_professional: "healthbenchProfessional",
  harvey_lab: "harveyLab",
  omniscience: "omniscience",
  code2video_elo: "code2videoElo",
  aa_3d: "aa3dElo",
  mka: "mkaClimbWsr",
  vials: "vialsScore",
} as const satisfies Record<BenchmarkKey, string>;

/** Every spelling a projected AA row may carry a benchmark under — the keys `AaRow` accepts. */
export type BenchmarkWireName = (typeof BENCHMARK_WIRE_NAMES)[BenchmarkKey];

export function benchmarkWireName(key: BenchmarkKey): BenchmarkWireName {
  return BENCHMARK_WIRE_NAMES[key];
}

/** The three lists differ only by which keys they leave out, so the leaves are differences against `BENCHMARK_KEYS`: a hand-copied list silently drops the metric. */
const LEADERBOARD_EXCLUDED = new Set<BenchmarkKey>(["cyber_index", "deepsec_bench", "cwe_bench"]);

/** `/models` also leaves out the Briefcase Elo, which only the leaderboard and omniscience pages score. */
const MODELS_EXCLUDED = new Set<BenchmarkKey>([...LEADERBOARD_EXCLUDED, "briefcase_elo"]);

export const LEADERBOARD_BENCHMARK_KEYS: readonly BenchmarkKey[] = BENCHMARK_KEYS.filter(
  (key) => !LEADERBOARD_EXCLUDED.has(key),
);

/** Benchmark key → the key in the leaderboard row's `scores` object, where the upstream uses kebab-case evaluation names; `omniscience` has no entry because the signed index stays a top-level row field. */
const SCORE_KEY_TABLE = {
  gpqa: "gpqa-diamond",
  hle: "humanitys-last-exam",
  hle_diamond: "hle-diamond",
  aime_2025: "aime-2025",
  gdpval: "gdpval-aa-normalized",
  gdp_pdf: "gdp-pdf",
  scicode: "scicode",
  livecodebench: "livecodebench",
  ifbench: "ifbench",
  lcr: "artificial-analysis-long-context-reasoning",
  mlcr: "mlcr-aa",
  tau2: "tau2-bench",
  tau_banking: "tau3-banking",
  terminalbench_v2_1: "terminalbench-2-1",
  terminalbench_hard: "terminalbench-hard",
  terminalbench_v4_0: "terminalbench-4-0",
  terminalbench_science: "terminal-bench-science",
  critpt: "critpt",
  critpt_v2_hard: "critpt-v2-hard",
  frontiercode_2_0: "frontiercode-2-0",
  frontiercode: "frontiercode",
  apex_agents: "apex-agents-aa",
  briefcase_elo: "aa-briefcase",
  itbench_sre: "itbench-aa",
  mmmu_pro: "mmmu-pro",
  automation_bench: "automationbench-aa",
  enterprise_ops_gym: "enterprise-ops-gym-aa",
  healthbench: "healthbench",
  healthbench_professional: "healthbench-professional",
  harvey_lab: "harvey-lab-aa",
  code2video_elo: "code2video-aa",
  mka: "mka",
  vials: "vials-aa",
  aa_3d: "aa-3d",
} as const satisfies Partial<Record<BenchmarkKey, string>>;

/** A spelling that only exists inside the leaderboard's `scores` object, never on a projected row. */
export type LeaderboardScoreKey = (typeof SCORE_KEY_TABLE)[keyof typeof SCORE_KEY_TABLE];

/** The same table typed as a `BenchmarkKey` lookup: `omniscience` is deliberately absent, so an indexed read answers `undefined` for it. */
export const LEADERBOARD_SCORE_KEYS: Partial<Record<BenchmarkKey, LeaderboardScoreKey>> = SCORE_KEY_TABLE;

// `gdpval` is included: the upstream retired `gdpvalNormalized` and ships the Elo itself (e.g. 1586.76) with a
// `gdpvalInterval`; `ABSOLUTE_SCORE_BENCHMARKS` declares it absolute so `compact` keeps the Elo.
const MODELS_BENCHMARKS: readonly BenchmarkKey[] = BENCHMARK_KEYS.filter((key) => !MODELS_EXCLUDED.has(key));

export const modelsBenchmarkWireNames: readonly BenchmarkWireName[] = MODELS_BENCHMARKS.map(benchmarkWireName);
// `BENCHMARK_KEYS` is the omniscience page's field list: it scores every benchmark, including the three security
// evaluations the leaderboard's `scores` object omits.
export const omniscienceBenchmarkWireNames: readonly BenchmarkWireName[] = BENCHMARK_KEYS.map(benchmarkWireName);

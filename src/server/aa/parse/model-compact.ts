import {
  bool,
  isoDate,
  numCoerce,
  numCoerceNonNegative,
  numericLabel,
  obj,
  str,
  strOr,
} from "@/server/formats/parser-primitives";
import { BENCHMARK_KEYS, MODALITY_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { clampedPercent, unclampedPercent } from "@/shared/utils";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  apex_agents: "apexAgents",
  automation_bench: "automationBenchPartialScore",
  briefcase_elo: "briefcaseElo",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  // `gdpval` upstream is the raw Elo score (1076-1866); `gdpvalNormalized` is the 0-1 ratio
  // on the same scale as gpqa/hle and is the value that belongs in the benchmark.
  gdpval: "gdpvalNormalized",
  itbench_sre: "itbenchSre",
  mmmu_pro: "mmmuPro",
  tau_banking: "tauBanking",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_science: "terminalBenchScience",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_v4_0: "terminalBench40",
};

// Upstream spells the same benchmark differently per path: /models serves `itBenchSre`,
// /leaderboards and /omniscience serve `itbenchSre`. The canonical name wins downstream.
const FIELD_ALIASES: Record<string, readonly string[]> = {
  itbenchSre: ["itbenchSre", "itBenchSre"],
};

/** Every upstream spelling accepted for a canonical field name. */
export function fieldAliases(field: string): readonly string[] {
  return FIELD_ALIASES[field] ?? [field];
}

/** Canonical upstream field name for a benchmark key. */
export function benchmarkWireName(key: BenchmarkKey): string {
  return BENCHMARK_FIELD_OVERRIDES[key] ?? key;
}

// Which benchmarks each Artificial Analysis path serves, verified against the live payloads.
// A benchmark a path does not serve is contributed by another path and merged in, so its
// absence from that path is not drift and must not be reported as a missing field.
const LEADERBOARD_BENCHMARKS = [
  "gpqa",
  "hle",
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
  "itbench_sre",
  "mmmu_pro",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

const MODELS_BENCHMARKS = [
  "gpqa",
  "hle",
  "gdpval",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "terminalbench_science",
  "critpt",
  "apex_agents",
  "itbench_sre",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

// /omniscience serves the raw `gdpval` Elo score but not `gdpvalNormalized`, so gdpval is
// contributed by the leaderboard and /models instead.
const OMNISCIENCE_BENCHMARKS = [
  "gpqa",
  "hle",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "terminalbench_v4_0",
  "terminalbench_science",
  "critpt",
  "apex_agents",
  "briefcase_elo",
  "itbench_sre",
  "cwe_bench",
  "cyber_index",
  "deepsec_bench",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

export const leaderboardBenchmarkWireNames = LEADERBOARD_BENCHMARKS.map(benchmarkWireName);
export const modelsBenchmarkWireNames = MODELS_BENCHMARKS.map(benchmarkWireName);
export const omniscienceBenchmarkWireNames = OMNISCIENCE_BENCHMARKS.map(benchmarkWireName);

function compactBenchmarks(m: Record<string, unknown>): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const wire = benchmarkWireName(key);
    let raw: number | null = null;
    for (const alias of fieldAliases(wire)) {
      if (!(alias in m)) continue;
      raw = numCoerce(m[alias]);
      break;
    }
    const value = ABSOLUTE_SCORE_BENCHMARKS.has(key) ? raw : unclampedPercent(raw);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

function compactCodingIndex(m: Record<string, unknown>): number | null {
  const tb = clampedPercent(numCoerce(m.terminalBench21));
  const sc = clampedPercent(numCoerce(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function compactPricing(m: Record<string, unknown>): ModelPricing | null {
  const input = numCoerceNonNegative(m.price1mInputTokens);
  const output = numCoerceNonNegative(m.price1mOutputTokens);
  const cacheHit = numCoerceNonNegative(m.cacheHitPrice);
  const cacheWrite = numCoerceNonNegative(m.cacheWritePrice);
  if (input == null && output == null && cacheHit == null && cacheWrite == null) return null;
  return { input, output, cacheHit, cacheWrite };
}

function compactOmniscience(
  omniscienceBreakdown: Record<string, unknown> | undefined,
  omniscience: number | null,
  hallucinationRate: number | null,
): ModelOmniscienceBreakdown | null {
  if (omniscienceBreakdown == null && omniscience == null && hallucinationRate == null) return null;
  return {
    total: {
      accuracy: clampedPercent(numCoerce(omniscienceBreakdown?.accuracy)),
      attempt_rate: clampedPercent(numCoerce(omniscienceBreakdown?.attemptRate)),
      hallucination_rate: clampedPercent(numCoerce(omniscienceBreakdown?.hallucinationRate) ?? hallucinationRate),
      omniscience: unclampedPercent(omniscience),
    },
  };
}

const MODALITY_FIELD_SUFFIXES = MODALITY_KEYS.map((mo) => mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase());

export const modalityWireNames = MODALITY_KEYS.flatMap((mo) => {
  const suffix = mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase();
  return [`inputModality${suffix}`, `outputModality${suffix}`];
});

// /omniscience serves only the non-text input modalities; /models serves all eight.
export const omniscienceModalityWireNames = ["inputModalityImage", "inputModalitySpeech", "inputModalityVideo"];

function assignModalities(model: ArtificialAnalysisModel, m: Record<string, unknown>): void {
  for (let i = 0; i < MODALITY_KEYS.length; i++) {
    const mo = MODALITY_KEYS[i]!;
    const suffix = MODALITY_FIELD_SUFFIXES[i]!;
    const inputMo = bool(m[`inputModality${suffix}`]);
    if (inputMo !== undefined) model[`input_modality_${mo}`] = inputMo;
    const outputMo = bool(m[`outputModality${suffix}`]);
    if (outputMo !== undefined) model[`output_modality_${mo}`] = outputMo;
  }
}

export function compact(m: Record<string, unknown>): ArtificialAnalysisModel {
  const rec = m;
  const creator = obj(rec.creator);
  const creatorName = creator ? str(creator.name).trim() : "";
  const creatorColor = creator ? str(creator.color).trim() : "";
  const parameters = numCoerce(rec.parameters);
  const speed = numCoerce(rec.medianCanonicalAnswerOutputSpeed);
  const model: ArtificialAnalysisModel = {
    id: str(rec.id) || str(rec.slug),
    slug: str(rec.slug),
    name: str(rec.name),
    short_name: strOr(rec.shortName) ?? null,
    model_creators: creatorName ? { name: creatorName, color: creatorColor || null } : null,
    intelligence_index: numCoerce(rec.intelligenceIndex),
    is_reasoning: bool(rec.isReasoning) ?? false,
    release_date: isoDate(strOr(rec.releaseDate)),
    is_open_weights: bool(rec.isOpenWeights) ?? false,
    parameters: parameters != null && parameters > 0 ? parameters : null,
    // sizeClass arrives upstream as a label or a bare number; keep both forms.
    size_class: strOr(rec.sizeClass) ?? numericLabel(rec.sizeClass),
    coding_index: compactCodingIndex(rec),
    agentic_index: clampedPercent(numCoerce(rec.analystAgent)),
    benchmarks: compactBenchmarks(rec),
    pricing: compactPricing(rec),
    speed: speed == null ? null : { median_output_speed: speed },
    input_modality_text: true,
    input_modality_image: false,
    input_modality_speech: false,
    input_modality_video: false,
    output_modality_text: true,
    output_modality_image: false,
    output_modality_speech: false,
    output_modality_video: false,
    omniscience_breakdown: compactOmniscience(
      obj(rec.omniscienceBreakdown),
      numCoerce(rec.omniscience),
      numCoerce(rec.omniscienceHallucinationRate),
    ),
  };
  assignModalities(model, rec);
  return model;
}

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
import { ratioToPercent } from "@/shared/utils";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  apex_agents: "apexAgents",
  automation_bench: "automationBenchPartialScore",
  briefcase_elo: "briefcaseElo",
  cwe_bench: "cweBench",
  cyber_index: "cyberIndex",
  deepsec_bench: "deepsecBench",
  gdpval: "gdpvalNormalized",
  itbench_sre: "itbenchSre",
  mmmu_pro: "mmmuPro",
  tau_banking: "tauBanking",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_science: "terminalBenchScience",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_v4_0: "terminalBench40",
};

const FIELD_ALIASES: Record<string, readonly string[]> = {
  itbenchSre: ["itbenchSre", "itBenchSre"],
};

export function fieldAliases(field: string): readonly string[] {
  return FIELD_ALIASES[field] ?? [field];
}

/**
 * Called once per benchmark field per row, so it deliberately skips `fieldAliases`: that built a one-element array
 * for every field without an alias, which is all but one of them.
 */
export function presentAlias(row: Record<string, unknown>, field: string): string | undefined {
  const aliases = FIELD_ALIASES[field];
  if (aliases === undefined) return field in row ? field : undefined;
  return aliases.find((alias) => alias in row);
}

export function benchmarkWireName(key: BenchmarkKey): string {
  return BENCHMARK_FIELD_OVERRIDES[key] ?? key;
}

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

// `gdpval` is deliberately missing: on the /models page that key carries the raw GDPval Elo (e.g. 1586.76) with a
// `gdpvalInterval`, not the 0-1 ratio the leaderboard exports as `gdpvalNormalized`. Expecting it here projected a
// field that either landed on the wrong scale or was dropped by `ratioScore`, and reported a permanent drift warning.
const MODELS_BENCHMARKS = [
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
  "itbench_sre",
  "mmmu_pro",
  "automation_bench",
  "omniscience",
] as const satisfies readonly BenchmarkKey[];

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

/** Reports a field that is declared as a 0-1 ratio but arrived on another scale, so a drop is never silent. */
export type RatioWarn = (field: string, value: number) => void;

function ratioScore(field: string, raw: number | null, warn?: RatioWarn): number | null {
  const percent = ratioToPercent(raw);
  if (percent == null && raw != null) warn?.(field, raw);
  return percent;
}

function compactBenchmarks(m: Record<string, unknown>, warn?: RatioWarn): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const wire = benchmarkWireName(key);
    const alias = presentAlias(m, wire);
    const raw = alias === undefined ? null : numCoerce(m[alias]);
    // Briefcase Elo, the Cyber index and the signed omniscience index are already on their own scale.
    const value = ABSOLUTE_SCORE_BENCHMARKS.has(key) ? raw : ratioScore(wire, raw, warn);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

function compactCodingIndex(m: Record<string, unknown>, warn?: RatioWarn): number | null {
  const tb = ratioScore("terminalBench21", numCoerce(m.terminalBench21), warn);
  const sc = ratioScore("scicode", numCoerce(m.scicode), warn);
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
  warn?: RatioWarn,
): ModelOmniscienceBreakdown | null {
  if (omniscienceBreakdown == null && omniscience == null && hallucinationRate == null) return null;
  return {
    total: {
      accuracy: ratioScore("omniscienceBreakdown.accuracy", numCoerce(omniscienceBreakdown?.accuracy), warn),
      attempt_rate: ratioScore("omniscienceBreakdown.attemptRate", numCoerce(omniscienceBreakdown?.attemptRate), warn),
      hallucination_rate: ratioScore(
        "omniscienceBreakdown.hallucinationRate",
        numCoerce(omniscienceBreakdown?.hallucinationRate) ?? hallucinationRate,
        warn,
      ),
      // A signed index, not a percentage: it is negative for models that hallucinate more than they know.
      omniscience: numCoerce(omniscience),
    },
  };
}

/**
 * Wire names are fixed per modality, so they are built once: `assignModalities` used to rebuild eight template
 * strings for every row, and a refresh hands it a few hundred rows.
 */
const MODALITY_WIRES = MODALITY_KEYS.map((mo) => {
  const suffix = mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase();
  return { key: mo, input: `inputModality${suffix}`, output: `outputModality${suffix}` };
});

export const modalityWireNames = MODALITY_WIRES.flatMap((wire) => [wire.input, wire.output]);

export const omniscienceModalityWireNames = ["inputModalityImage", "inputModalitySpeech", "inputModalityVideo"];

function assignModalities(model: ArtificialAnalysisModel, m: Record<string, unknown>): void {
  for (const wire of MODALITY_WIRES) {
    const inputMo = bool(m[wire.input]);
    if (inputMo !== undefined) model[`input_modality_${wire.key}`] = inputMo;
    const outputMo = bool(m[wire.output]);
    if (outputMo !== undefined) model[`output_modality_${wire.key}`] = outputMo;
  }
}

export function compact(m: Record<string, unknown>, warn?: RatioWarn): ArtificialAnalysisModel {
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
    size_class: strOr(rec.sizeClass) ?? numericLabel(rec.sizeClass),
    coding_index: compactCodingIndex(rec, warn),
    agentic_index: ratioScore("analystAgent", numCoerce(rec.analystAgent), warn),
    benchmarks: compactBenchmarks(rec, warn),
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
      warn,
    ),
  };
  assignModalities(model, rec);
  return model;
}

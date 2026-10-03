import {
  bool,
  isRecord,
  isoDate,
  numCoerce,
  numCoerceNonNegative,
  obj,
  str,
  strOr,
} from "@/server/parsers/parser-primitives";
import { BENCHMARK_KEYS, MODALITY_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { clampedPercent, unclampedPercent } from "@/shared/utils";

export const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_v4_0: "terminalBench40",
  apex_agents: "apexAgents",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
};

function compactBenchmarks(m: Record<string, unknown>): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const raw = numCoerce(m[BENCHMARK_FIELD_OVERRIDES[key] ?? key]);
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
): ModelOmniscienceBreakdown | null {
  if (omniscienceBreakdown == null && omniscience == null) return null;
  return {
    total: {
      accuracy: clampedPercent(numCoerce(omniscienceBreakdown?.accuracy)),
      attempt_rate: clampedPercent(numCoerce(omniscienceBreakdown?.attemptRate)),
      hallucination_rate: clampedPercent(numCoerce(omniscienceBreakdown?.hallucinationRate)),
      omniscience: unclampedPercent(omniscience),
    },
  };
}

const MODALITY_FIELD_SUFFIXES = MODALITY_KEYS.map((mo) => mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase());

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

export function compact(m: unknown): ArtificialAnalysisModel {
  const rec = isRecord(m) ? m : {};
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
    size_class: strOr(rec.sizeClass) ?? null,
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
    omniscience_breakdown: compactOmniscience(obj(rec.omniscienceBreakdown), numCoerce(rec.omniscience)),
  };
  assignModalities(model, rec);
  return model;
}

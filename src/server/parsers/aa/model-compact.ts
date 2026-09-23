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
import {
  BENCHMARK_KEYS,
  MODALITY_KEYS,
  ABSOLUTE_SCORE_BENCHMARKS,
  type BenchmarkKey,
} from "@/shared/config";
import type { ArtificialAnalysisModel, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { normalizePercent, unclampedPercent } from "@/shared/utils";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalBench21",
  terminalbench_hard: "terminalbenchHard",
  terminalbench_v4_0: "terminalBench40",
  apex_agents: "apexAgents",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
};

/** Benchmarks use the 0-100 scale the renderer expects, `ABSOLUTE_SCORE_BENCHMARKS` excepted. */
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
  const tb = normalizePercent(numCoerce(m.terminalBench21));
  const sc = normalizePercent(numCoerce(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function compactPricing(m: Record<string, unknown>): ModelPricing | undefined {
  const pricing: ModelPricing = {};
  const input = numCoerceNonNegative(m.price1mInputTokens);
  const output = numCoerceNonNegative(m.price1mOutputTokens);
  const cacheHit = numCoerceNonNegative(m.cacheHitPrice);
  const cacheWrite = numCoerceNonNegative(m.cacheWritePrice);
  if (input != null) pricing.input = input;
  if (output != null) pricing.output = output;
  if (cacheHit != null) pricing.cacheHit = cacheHit;
  if (cacheWrite != null) pricing.cacheWrite = cacheWrite;
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function compactOmniscience(
  omniscienceBreakdown: Record<string, unknown> | undefined,
  omniscience: number | null,
): ModelOmniscienceBreakdown | undefined {
  if (omniscienceBreakdown == null && omniscience == null) return undefined;
  const total: NonNullable<ModelOmniscienceBreakdown["total"]> = {};
  const accuracy = normalizePercent(numCoerce(omniscienceBreakdown?.accuracy));
  const attemptRate = normalizePercent(numCoerce(omniscienceBreakdown?.attemptRate));
  const hallucinationRate = normalizePercent(numCoerce(omniscienceBreakdown?.hallucinationRate));
  const omni = unclampedPercent(omniscience);
  if (accuracy != null) total.accuracy = accuracy;
  if (attemptRate != null) total.attempt_rate = attemptRate;
  if (hallucinationRate != null) total.hallucination_rate = hallucinationRate;
  if (omni != null) total.omniscience = omni;
  return { total };
}

function assignModalities(model: ArtificialAnalysisModel, m: Record<string, unknown>): void {
  for (const mo of MODALITY_KEYS) {
    const suffix = mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase();
    const inputMo = bool(m[`inputModality${suffix}`]);
    if (inputMo !== undefined) model[`input_modality_${mo}`] = inputMo;
    const outputMo = bool(m[`outputModality${suffix}`]);
    if (outputMo !== undefined) model[`output_modality_${mo}`] = outputMo;
  }
  // Upstream quirk: the index body omits the text flags; only a record that describes part of
  // its modalities gets the text fallback, and an explicit flag always wins.
  const describesModalities = MODALITY_KEYS.some(
    (mo) => model[`input_modality_${mo}`] !== undefined || model[`output_modality_${mo}`] !== undefined,
  );
  if (!describesModalities) return;
  if (model.input_modality_text === undefined) model.input_modality_text = true;
  if (model.output_modality_text === undefined) model.output_modality_text = true;
}

export function compact(m: unknown): ArtificialAnalysisModel {
  const rec = isRecord(m) ? m : {};
  const creator = obj(rec.creator);
  const omniscienceBreakdown = obj(rec.omniscienceBreakdown);

  const creatorName = creator ? str(creator.name).trim() : "";
  const creatorColor = creator ? str(creator.color).trim() : "";
  const model: ArtificialAnalysisModel = {
    id: str(rec.id) || str(rec.slug),
    slug: str(rec.slug),
    name: str(rec.name),
    intelligence_index: numCoerce(rec.intelligenceIndex),
  };

  const shortName = strOr(rec.shortName);
  if (shortName != null) model.short_name = shortName;
  if (creatorName) model.model_creators = { name: creatorName, color: creatorColor };
  const isReasoning = bool(rec.isReasoning);
  if (isReasoning !== undefined) model.is_reasoning = isReasoning;
  const coding = compactCodingIndex(rec);
  if (coding != null) model.coding_index = coding;
  const agenticPct = normalizePercent(numCoerce(rec.analystAgent));
  if (agenticPct != null) model.agentic_index = agenticPct;
  const releaseDate = isoDate(strOr(rec.releaseDate));
  if (releaseDate != null) model.release_date = releaseDate;
  const isOpenWeights = bool(rec.isOpenWeights);
  if (isOpenWeights !== undefined) model.is_open_weights = isOpenWeights;
  const parameters = numCoerce(rec.parameters);
  const parametersPositive = parameters != null && parameters > 0 ? parameters : null;
  if (parametersPositive != null) model.parameters = parametersPositive;
  const sizeClass = strOr(rec.sizeClass);
  if (sizeClass != null) model.size_class = sizeClass;

  model.benchmarks = compactBenchmarks(rec);
  const pricing = compactPricing(rec);
  if (pricing) model.pricing = pricing;
  const speed = numCoerce(rec.medianCanonicalAnswerOutputSpeed);
  if (speed != null) model.speed = { median_output_speed: speed };
  const breakdown = compactOmniscience(omniscienceBreakdown, numCoerce(rec.omniscience));
  if (breakdown) model.omniscience_breakdown = breakdown;
  assignModalities(model, rec);
  return model;
}

import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import {
  bool,
  isoDate,
  num,
  numNonNegative,
  numPositive,
  obj,
  str,
  strOr,
  titleCase,
} from "@/server/parsers/primitives";
import { normalizePercent } from "@/shared/utils";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalbenchV21",
  terminalbench_v4_0: "terminalbenchV40",
  apex_agents: "apexAgents",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
};

function compactBenchmarks(m: Record<string, unknown>): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const value = num(m[BENCHMARK_FIELD_OVERRIDES[key] ?? key]);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

const MODALITIES = ["text", "image", "speech", "video"] as const;

function compactCodingIndex(m: Record<string, unknown>): number | null {
  const tb = normalizePercent(num(m.terminalbenchV21));
  const sc = normalizePercent(num(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function compactPricing(m: Record<string, unknown>): ModelPricing | undefined {
  const pricing: ModelPricing = {};
  const input = numNonNegative(m.price1mInputTokens);
  const output = numNonNegative(m.price1mOutputTokens);
  const cacheHit = numNonNegative(m.cacheHitPrice);
  const cacheWrite = numNonNegative(m.cacheWritePrice);
  if (input != null) pricing.input = input;
  if (output != null) pricing.output = output;
  if (cacheHit != null) pricing.cacheHit = cacheHit;
  if (cacheWrite != null) pricing.cacheWrite = cacheWrite;
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function defaultMonthlyCost(pricing: ModelPricing | undefined): number | null {
  if (!pricing || typeof pricing.input !== "number" || typeof pricing.output !== "number") return null;
  const hitRate = 0.5;
  const hasWrite = typeof pricing.cacheWrite === "number";
  const writeRate = hasWrite ? Math.min(0.05, 1 - hitRate) : 0;
  const freshRate = 1 - hitRate - writeRate;
  const cached = typeof pricing.cacheHit === "number" ? pricing.cacheHit : pricing.input;
  const writeLeg = hasWrite ? writeRate * pricing.cacheWrite! : 0;
  const inputRate = hitRate * cached + writeLeg + freshRate * pricing.input;
  const daily = 2 * inputRate + 3 * pricing.output;
  const monthly = daily * 22;
  return Number.isFinite(monthly) ? Math.round(monthly * 100) / 100 : null;
}

function compactOmniscience(
  omniscienceBreakdown: Record<string, unknown> | undefined,
  omniscience: number | null,
): ModelOmniscienceBreakdown | undefined {
  if (omniscienceBreakdown == null && omniscience == null) return undefined;
  const total: NonNullable<ModelOmniscienceBreakdown["total"]> = {};
  const accuracy = normalizePercent(num(omniscienceBreakdown?.accuracy));
  const attemptRate = normalizePercent(num(omniscienceBreakdown?.attemptRate));
  const hallucinationRate = normalizePercent(num(omniscienceBreakdown?.hallucinationRate));
  const omni = normalizePercent(omniscience);
  if (accuracy != null) total.accuracy = accuracy;
  if (attemptRate != null) total.attempt_rate = attemptRate;
  if (hallucinationRate != null) total.hallucination_rate = hallucinationRate;
  if (omni != null) total.omniscience = omni;
  return { total };
}

function assignModalities(model: ArtificialAnalysisModel, m: Record<string, unknown>): void {
  for (const mo of MODALITIES) {
    const suffix = titleCase(mo);
    const inputMo = bool(m[`inputModality${suffix}`]);
    if (inputMo !== undefined) model[`input_modality_${mo}`] = inputMo;
    const outputMo = bool(m[`outputModality${suffix}`]);
    if (outputMo !== undefined) model[`output_modality_${mo}`] = outputMo;
  }
}

export function compact(m: Record<string, unknown>): ArtificialAnalysisModel {
  const creator = obj(m.creator);
  const omniscienceBreakdown = obj(m.omniscienceBreakdown);

  const creatorName = creator ? str(creator.name).trim() : "";
  const creatorColor = creator ? str(creator.color).trim() : "";
  const model: ArtificialAnalysisModel = {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    intelligence_index: num(m.intelligenceIndex),
  };

  const shortName = strOr(m.shortName);
  if (shortName != null) model.short_name = shortName;
  if (creatorName) model.model_creators = { name: creatorName, color: creatorColor };
  const isReasoning = bool(m.isReasoning);
  if (isReasoning !== undefined) model.is_reasoning = isReasoning;
  const coding = compactCodingIndex(m);
  if (coding != null) model.coding_index = coding;
  const agenticPct = normalizePercent(num(m.analystAgent));
  if (agenticPct != null) model.agentic_index = agenticPct;
  const releaseDate = isoDate(strOr(m.releaseDate));
  if (releaseDate != null) model.release_date = releaseDate;
  const isOpenWeights = bool(m.isOpenWeights);
  if (isOpenWeights !== undefined) model.is_open_weights = isOpenWeights;
  const parameters = numPositive(m.parameters);
  if (parameters != null) model.parameters = parameters;
  const sizeClass = strOr(m.sizeClass);
  if (sizeClass != null) model.size_class = sizeClass;

  model.benchmarks = compactBenchmarks(m);
  const pricing = compactPricing(m);
  if (pricing) {
    model.pricing = pricing;
    const defCost = defaultMonthlyCost(pricing);
    if (defCost != null) model.defaultMonthlyCost = defCost;
  }
  const speed = num(m.medianCanonicalAnswerOutputSpeed);
  if (speed != null) model.speed = { median_output_speed: speed };
  const breakdown = compactOmniscience(omniscienceBreakdown, num(m.omniscience));
  if (breakdown) model.omniscience_breakdown = breakdown;
  assignModalities(model, m);
  return model;
}

export function compactOmniscienceEnrich(m: Record<string, unknown>): Record<string, unknown> {
  const breakdown = obj(m.omniscienceBreakdown);
  return {
    slug: str(m.slug),
    omniscience: num(m.omniscience),
    omniscienceBreakdown:
      breakdown != null
        ? {
            accuracy: num(breakdown.accuracy),
            attemptRate: num(breakdown.attemptRate),
            hallucinationRate: num(breakdown.hallucinationRate),
          }
        : undefined,
  };
}

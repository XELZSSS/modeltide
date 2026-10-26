import { bool, numCoerce, numCoerceNonNegative, numericLabel, obj, str, strOr, text } from "@/server/formats/scalars";
import { isoDate } from "@/server/formats/dates";
import {
  BENCHMARK_KEYS,
  MODALITY_KEYS,
  ABSOLUTE_SCORE_BENCHMARKS,
  type BenchmarkKey,
  type ModalityKey,
} from "@/shared/config";
import type { ArtificialAnalysisModel, ModelModalities, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { ratioToPercent } from "@/shared/utils";
import { benchmarkWireName, presentAlias } from "./benchmark-fields";

/** Reports a field that is declared as a 0-1 ratio but arrived on another scale, so a drop is never silent. */
type RatioWarn = (field: string, value: number) => void;

function ratioScore(field: string, raw: number | null, warn?: RatioWarn): number | null {
  const percent = ratioToPercent(raw);
  if (percent == null && raw != null) warn?.(field, raw);
  return percent;
}

/**
 * A benchmark declared as a 0-1 ratio, kept exactly as the upstream sent it: the detail page exists to show the source
 * value, so rescaling here would put this site's arithmetic between the reader and the payload. The 0-1 bound is still
 * checked, because a value outside it means the upstream changed scale (an Elo, a percentage) and must drop out loudly
 * instead of being printed as a fraction it is not.
 */
function ratioAsIs(field: string, raw: number | null, warn?: RatioWarn): number | null {
  if (raw == null) return null;
  if (raw < 0 || raw > 1) {
    warn?.(field, raw);
    return null;
  }
  return raw;
}

function compactBenchmarks(m: Record<string, unknown>, warn?: RatioWarn): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const wire = benchmarkWireName(key);
    const alias = presentAlias(m, wire);
    const raw = alias === undefined ? null : numCoerce(m[alias]);
    // The index benchmarks are already on their own scale; a ratio one is kept exactly as the upstream sent it.
    const value = ABSOLUTE_SCORE_BENCHMARKS.has(key) ? raw : ratioAsIs(wire, raw, warn);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

function compactCodingIndex(m: Record<string, unknown>, warn?: RatioWarn): number | null {
  const tb = ratioScore("terminalBench21", numCoerce(m.terminalBench21), warn);
  const sc = ratioScore("scicode", numCoerce(m.scicode), warn);
  if (tb == null) return sc;
  if (sc == null) return tb;
  return (tb + sc) / 2;
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
      accuracy: ratioAsIs("omniscienceBreakdown.accuracy", numCoerce(omniscienceBreakdown?.accuracy), warn),
      attempt_rate: ratioAsIs("omniscienceBreakdown.attemptRate", numCoerce(omniscienceBreakdown?.attemptRate), warn),
      hallucination_rate: ratioAsIs(
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

/**
 * One array per direction, in `MODALITY_KEYS` order. A modality the upstream omits keeps the historical default —
 * text only — and one it declares wins, which is what the eight per-row booleans said at ten times the size.
 */
function pickModalities(m: Record<string, unknown>, prefix: "input" | "output"): ModalityKey[] {
  return MODALITY_WIRES.filter((wire) => {
    const declared = bool(m[wire[prefix]]);
    return declared === undefined ? wire.key === "text" : declared;
  }).map((wire) => wire.key);
}

function compactModalities(m: Record<string, unknown>): ModelModalities {
  return { in: pickModalities(m, "input"), out: pickModalities(m, "output") };
}

export function compact(m: Record<string, unknown>, warn?: RatioWarn): ArtificialAnalysisModel {
  const rec = m;
  const creator = obj(rec.creator);
  const creatorName = creator ? text(creator.name) : "";
  const creatorColor = creator ? text(creator.color) : "";
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
    context_window_tokens: numCoerceNonNegative(rec.contextWindowTokens),
    coding_index: compactCodingIndex(rec, warn),
    agentic_index: ratioScore("analystAgent", numCoerce(rec.analystAgent), warn),
    benchmarks: compactBenchmarks(rec, warn),
    pricing: compactPricing(rec),
    speed: speed == null ? null : { median_output_speed: speed },
    modalities: compactModalities(rec),
    omniscience_breakdown: compactOmniscience(
      obj(rec.omniscienceBreakdown),
      numCoerce(rec.omniscience),
      numCoerce(rec.omniscienceHallucinationRate),
      warn,
    ),
  };
  return model;
}

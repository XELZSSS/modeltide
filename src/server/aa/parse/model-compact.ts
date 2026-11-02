import { bool, numCoerce, numCoerceNonNegative, numericLabel, str, strOr } from "@/server/formats/scalars";
import { isoDate } from "@/server/formats/dates";
import { BENCHMARK_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey, type ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel, ModelModalities, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { ratioToPercent } from "@/shared/utils";
import { benchmarkWireName } from "./benchmark-fields";
import {
  creatorOf,
  fieldValue,
  MODALITY_WIRES,
  omniscienceBreakdownOf,
  type AaOmniscienceBreakdown,
  type AaRow,
} from "../wire";

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

function compactBenchmarks(m: AaRow, warn?: RatioWarn): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const wire = benchmarkWireName(key);
    const raw = numCoerce(fieldValue(m, wire));
    // The index benchmarks are already on their own scale; a ratio one is kept exactly as the upstream sent it.
    const value = ABSOLUTE_SCORE_BENCHMARKS.has(key) ? raw : ratioAsIs(wire, raw, warn);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

function compactCodingIndex(m: AaRow, warn?: RatioWarn): number | null {
  const tb = ratioScore("terminalBench21", numCoerce(m.terminalBench21), warn);
  const sc = ratioScore("scicode", numCoerce(m.scicode), warn);
  if (tb == null) return sc;
  if (sc == null) return tb;
  return (tb + sc) / 2;
}

function compactPricing(m: AaRow): ModelPricing | null {
  const input = numCoerceNonNegative(m.price1mInputTokens);
  const output = numCoerceNonNegative(m.price1mOutputTokens);
  const cacheHit = numCoerceNonNegative(m.cacheHitPrice);
  const cacheWrite = numCoerceNonNegative(m.cacheWritePrice);
  if (input == null && output == null && cacheHit == null && cacheWrite == null) return null;
  return { input, output, cacheHit, cacheWrite };
}

function compactOmniscience(
  omniscienceBreakdown: AaOmniscienceBreakdown | undefined,
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
 * One array per direction, in `MODALITY_KEYS` order. A modality the upstream omits keeps the historical default —
 * text only — and one it declares wins, which is what the eight per-row booleans said at ten times the size.
 */
function pickModalities(m: AaRow, prefix: "input" | "output"): ModalityKey[] {
  return MODALITY_WIRES.filter((wire) => {
    const declared = bool(m[wire[prefix]]);
    return declared === undefined ? wire.key === "text" : declared;
  }).map((wire) => wire.key);
}

function compactModalities(m: AaRow): ModelModalities {
  return { in: pickModalities(m, "input"), out: pickModalities(m, "output") };
}

/**
 * Projects one normalized AA row onto the public model shape. `m` is `AaRow`, not a record: every field this reads is a
 * declared member, so a rename in the wire contract is a compile error here rather than a `null` in the payload.
 */
export function compact(m: AaRow, warn?: RatioWarn): ArtificialAnalysisModel {
  const creator = creatorOf(m);
  const parameters = numCoerce(m.parameters);
  const speed = numCoerce(m.medianCanonicalAnswerOutputSpeed);
  const model: ArtificialAnalysisModel = {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    short_name: strOr(m.shortName) ?? null,
    model_creators: creator.name ? { name: creator.name, color: creator.color || null } : null,
    intelligence_index: numCoerce(m.intelligenceIndex),
    is_reasoning: bool(m.isReasoning) ?? false,
    release_date: isoDate(strOr(m.releaseDate)),
    is_open_weights: bool(m.isOpenWeights) ?? false,
    parameters: parameters != null && parameters > 0 ? parameters : null,
    size_class: strOr(m.sizeClass) ?? numericLabel(m.sizeClass),
    context_window_tokens: numCoerceNonNegative(m.contextWindowTokens),
    coding_index: compactCodingIndex(m, warn),
    agentic_index: ratioScore("analystAgent", numCoerce(m.analystAgent), warn),
    benchmarks: compactBenchmarks(m, warn),
    pricing: compactPricing(m),
    speed: speed == null ? null : { median_output_speed: speed },
    modalities: compactModalities(m),
    omniscience_breakdown: compactOmniscience(
      omniscienceBreakdownOf(m),
      numCoerce(m.omniscience),
      numCoerce(m.omniscienceHallucinationRate),
      warn,
    ),
  };
  return model;
}

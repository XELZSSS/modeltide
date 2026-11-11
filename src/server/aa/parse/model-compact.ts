import { bool, numCoerce, numCoerceNonNegative, numericLabel, str, strOr } from "@/server/formats/scalars";
import { isoDate } from "@/server/formats/dates";
import type { ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel, ModelModalities, ModelOmniscienceBreakdown, ModelPricing } from "@/shared/types";
import { MODALITY_WIRES, type AaOmniscienceBreakdown, type AaRow } from "../wire";
import { creatorOf, omniscienceBreakdownOf } from "../wire-read";
import { compactBenchmarks, compactCodingIndex, ratioAsIs, ratioScore, type RatioWarn } from "./benchmark-scores";

function compactOmniscience(
  omniscienceBreakdown: AaOmniscienceBreakdown | undefined,
  omniscience: number | null,
  hallucinationRate: number | null,
  warn?: RatioWarn,
): ModelOmniscienceBreakdown | null {
  if (omniscienceBreakdown == null && omniscience == null && hallucinationRate == null) return null;
  // The leaderboard derives this rate as `1 − non-hallucination`; the enrichment pages carry the upstream's own value in a
  // breakdown block and once at the top level. The block is preferred, and each spelling is bound-checked before the next
  // is tried.
  const hallucination =
    ratioAsIs("omniscienceBreakdown.hallucinationRate", numCoerce(omniscienceBreakdown?.hallucinationRate), warn) ??
    ratioAsIs("omniscienceHallucinationRate", hallucinationRate, warn);
  return {
    total: {
      accuracy: ratioAsIs("omniscienceBreakdown.accuracy", numCoerce(omniscienceBreakdown?.accuracy), warn),
      attempt_rate: ratioAsIs("omniscienceBreakdown.attemptRate", numCoerce(omniscienceBreakdown?.attemptRate), warn),
      hallucination_rate: hallucination,
      // A signed index, not a percentage: it is negative for models that hallucinate more than they know.
      omniscience: numCoerce(omniscience),
    },
  };
}

/** One array per direction, in `MODALITY_KEYS` order. A modality the upstream omits keeps the historical default — text only. */
function pickModalities(m: AaRow, prefix: "input" | "output"): ModalityKey[] {
  const picked: ModalityKey[] = [];
  // One push loop rather than `filter().map()`, which builds two extra arrays per direction.
  for (const wire of MODALITY_WIRES) {
    const declared = bool(m[wire[prefix]]);
    if (declared === undefined ? wire.key === "text" : declared) picked.push(wire.key);
  }
  return picked;
}

/** The parameter count, when the row publishes a positive one: zero and nonsense are "not stated". */
function parametersOf(m: AaRow): number | null {
  const parameters = numCoerce(m.parameters);
  return parameters != null && parameters > 0 ? parameters : null;
}

/** All four prices, or none: a row that carries one of them is not a price. */
function pricingOf(m: AaRow): ModelPricing | null {
  const input = numCoerceNonNegative(m.price1mInputTokens);
  const output = numCoerceNonNegative(m.price1mOutputTokens);
  const cacheHit = numCoerceNonNegative(m.cacheHitPrice);
  const cacheWrite = numCoerceNonNegative(m.cacheWritePrice);
  if (input == null && output == null && cacheHit == null && cacheWrite == null) return null;
  return { input, output, cacheHit, cacheWrite };
}

/** The median output speed the row publishes, or `null` when it publishes none. */
function speedOf(m: AaRow): ArtificialAnalysisModel["speed"] {
  const speed = numCoerce(m.outputSpeed);
  return speed == null ? null : { median_output_speed: speed };
}

function modalitiesOf(m: AaRow): ModelModalities {
  return { in: pickModalities(m, "input"), out: pickModalities(m, "output") };
}

/** Projects one normalized AA row onto the public model shape; `m` is `AaRow`, so a rename in the wire contract is a compile error here. The projection is one literal grouped by concern, and `ArtificialAnalysisModel` declares every field required, so a group that stops contributing one is a compile error. */
export function compact(m: AaRow, warn?: RatioWarn): ArtificialAnalysisModel {
  const creator = creatorOf(m);
  return {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    short_name: strOr(m.shortName) ?? null,
    model_creators: creator.name ? { name: creator.name, color: creator.color || null } : null,
    is_reasoning: bool(m.isReasoning) ?? false,
    is_open_weights: bool(m.isOpenWeights) ?? false,
    parameters: parametersOf(m),
    size_class: strOr(m.sizeClass) ?? numericLabel(m.sizeClass),
    context_window_tokens: numCoerceNonNegative(m.contextWindowTokens),
    intelligence_index: numCoerce(m.intelligenceIndex),
    coding_index: compactCodingIndex(m, warn),
    agentic_index: ratioScore("analystAgent", numCoerce(m.analystAgent), warn),
    benchmarks: compactBenchmarks(m, warn),
    pricing: pricingOf(m),
    speed: speedOf(m),
    modalities: modalitiesOf(m),
    omniscience_breakdown: compactOmniscience(
      omniscienceBreakdownOf(m),
      numCoerce(m.omniscience),
      numCoerce(m.omniscienceHallucinationRate),
      warn,
    ),
    release_date: isoDate(strOr(m.releaseDate)),
  };
}

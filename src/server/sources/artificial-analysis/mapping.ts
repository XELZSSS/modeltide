import type { ArtificialAnalysisModel } from "@/shared/types";
import { num, str, strOr, bool, obj, numPositive, numNonNegative, isoDate } from "@/server/parsers/primitives";
import { normalizeModelKey, type ModelMetaEntry } from "@/server/sources/openrouter/mapping";
import { normalizePercent } from "@/shared/utils";
import { compactBenchmarks } from "./benchmarks";

const MODALITIES = ["text", "image", "speech", "video"] as const;
const capitalize = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

export function normalizeToPercent(v: number | null): number | null {
  if (v == null) return null;
  if (v > 1 && v <= 100) return v;
  if (v >= 0 && v <= 1) return v * 100;
  return normalizePercent(v);
}

function compactCodingIndex(m: Record<string, unknown>): number | null {
  const tb = normalizeToPercent(num(m.terminalbenchV21));
  const sc = normalizeToPercent(num(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Project one raw upstream model record onto the public ArtificialAnalysisModel shape. */
export function compact(m: Record<string, unknown>): ArtificialAnalysisModel {
  const creator = obj(m.creator);
  const agentic = num(m.analystAgent);
  const omniscience = num(m.omniscience);
  const omniscienceBreakdown = obj(m.omniscienceBreakdown);
  const cost = obj(m.intelligenceIndexCost);
  const timescale = obj(m.timescaleData);
  const rawRelease = strOr(m.releaseDate);
  const releaseDate = isoDate(rawRelease) ?? undefined;

  const model: ArtificialAnalysisModel = {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    short_name: strOr(m.shortName),
    model_creators: creator ? { name: str(creator.name), color: str(creator.color) } : undefined,
    intelligence_index: num(m.intelligenceIndex),
    is_reasoning: bool(m.isReasoning),
    coding_index: compactCodingIndex(m),
    agentic_index: normalizeToPercent(agentic),
    release_date: releaseDate,
    is_open_weights: bool(m.isOpenWeights),
    context_window_tokens: numPositive(m.contextWindowTokens),
    blended_price: numNonNegative(m.price1mBlended7To2To1),
    cost: cost
      ? {
          total: num(cost.total),
          input: num(cost.input),
          output: num(cost.output),
          reasoning: num(cost.reasoning),
        }
      : undefined,
    benchmarks: compactBenchmarks(m),
    pricing: {
      input: numNonNegative(m.price1mInputTokens),
      output: numNonNegative(m.price1mOutputTokens),
      cache_hit: numNonNegative(m.cacheHitPrice),
    },
    speed: {
      median_output_speed: num(timescale?.medianOutputSpeed) ?? num(m.medianCanonicalAnswerOutputSpeed),
    },
    omniscience_breakdown:
      omniscienceBreakdown != null || omniscience != null
        ? {
            total: {
              accuracy: normalizeToPercent(num(omniscienceBreakdown?.accuracy)),
              attempt_rate: normalizeToPercent(num(omniscienceBreakdown?.attemptRate)),
              hallucination_rate: normalizeToPercent(num(omniscienceBreakdown?.hallucinationRate)),
              omniscience: normalizeToPercent(omniscience),
            },
          }
        : undefined,
  };
  for (const mo of MODALITIES) {
    const suffix = capitalize(mo);
    model[`input_modality_${mo}`] = bool(m[`inputModality${suffix}`]);
    model[`output_modality_${mo}`] = bool(m[`outputModality${suffix}`]);
  }
  return model;
}

/** Partial fields merged into the catalog from the omniscience page. */
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

/**
 * Artificial Analysis "blended price": a 7:2:1 weighted mix of the cached-input / input /
 * output prices in $/1M tokens. The cached-input price falls back to the input price when
 * the model has no cache tier (matching upstream's behavior).
 */
export function computeBlendPrice(
  p?: { input?: number | null; output?: number | null; cache_hit?: number | null } | null,
): number | null {
  if (!p) return null;
  const { input, output } = p;
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  if (typeof output !== "number" || !Number.isFinite(output)) return null;
  const cache = typeof p.cache_hit === "number" && Number.isFinite(p.cache_hit) ? p.cache_hit : input;
  return (7 * cache + 2 * input + output) / 10;
}

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  for (const raw of [m.name, m.short_name, m.slug]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    const entry = key ? meta[key] : undefined;
    if (entry && (entry.contextLength != null || entry.agenticIndex != null || entry.pricing != null)) return entry;
  }
  return undefined;
}

/**
 * Fill missing context window / agentic index / blended-price values from an OpenRouter
 * directory meta map (loose-normalized model keys). Only null values are filled — first-party
 * AA data (including its own pricing for the blend) always wins — and the number of filled
 * fields is returned for logging.
 */
export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    if (m.context_window_tokens != null && m.agentic_index != null && m.blended_price != null) continue;
    const entry = matchMeta(m, meta);
    if (entry) {
      if (m.context_window_tokens == null && entry.contextLength != null) {
        m.context_window_tokens = entry.contextLength;
        filled++;
      }
      if (m.agentic_index == null && entry.agenticIndex != null) {
        m.agentic_index = normalizeToPercent(entry.agenticIndex);
        filled++;
      }
    }
    // Blended price: prefer the model's own AA pricing; fall back to the OpenRouter
    // directory pricing (already converted to $/1M) using the same 7:2:1 formula.
    // Independent of an OpenRouter meta match so AA-priced models are always covered.
    if (m.blended_price == null) {
      const fromMeta = entry?.pricing
        ? { input: entry.pricing.input, output: entry.pricing.output, cache_hit: entry.pricing.cacheHit }
        : undefined;
      const blend = computeBlendPrice(m.pricing ?? undefined) ?? computeBlendPrice(fromMeta);
      if (blend != null) {
        m.blended_price = blend;
        filled++;
      }
    }
  }
  return filled;
}

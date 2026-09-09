import { computeBlendPrice, isFiniteNumber, normalizeModelKey } from "@/shared/utils";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";

export type PriceAuthority = "official" | "catalog";

export interface EffectivePricing {
  input: number | null;
  output: number | null;
  cacheHit: number | null;
  cacheWrite: number | null;
  source: PriceAuthority | null;
}

export type OfficialGetter = (model: ArtificialAnalysisModel) => OfficialPriceModel | undefined;

const finiteOrNull = (v: unknown): number | null => (isFiniteNumber(v) ? v : null);

export function indexOfficialPricing(models: OfficialPriceModel[]): Map<string, OfficialPriceModel> {
  const map = new Map<string, OfficialPriceModel>();
  for (const m of models) {
    for (const raw of [m.name, m.id]) {
      if (!raw) continue;
      const key = normalizeModelKey(raw);
      if (key && !map.has(key)) map.set(key, m);
    }
  }
  return map;
}

export function matchOfficialPricing(
  index: Map<string, OfficialPriceModel>,
  model: { name?: string | null; short_name?: string | null; slug?: string | null },
): OfficialPriceModel | undefined {
  for (const raw of [model.name, model.short_name, model.slug]) {
    if (!raw) continue;
    const hit = index.get(normalizeModelKey(raw));
    if (hit) return hit;
  }
  return undefined;
}

export function resolveEffectivePricing(
  catalog: ArtificialAnalysisModel["pricing"],
  official?: OfficialPriceModel | null,
): EffectivePricing {
  const officialInput = finiteOrNull(official?.input);
  const officialOutput = finiteOrNull(official?.output);
  const officialCache = finiteOrNull(official?.cachedInput);
  const officialCacheWrite = finiteOrNull(official?.cacheWrite);
  const input = officialInput ?? finiteOrNull(catalog?.input);
  const output = officialOutput ?? finiteOrNull(catalog?.output);
  const cacheHit = officialCache ?? finiteOrNull(catalog?.cacheHit);
  const cacheWrite = officialCacheWrite ?? finiteOrNull(catalog?.cacheWrite);
  if (input == null && output == null) {
    return { input, output, cacheHit, cacheWrite, source: null };
  }
  const usedOfficial = officialInput != null || officialOutput != null;
  return { input, output, cacheHit, cacheWrite, source: usedOfficial ? "official" : "catalog" };
}

export function resolveBlendedPrice(
  model: ArtificialAnalysisModel,
  official?: OfficialPriceModel | null,
): number | null {
  return computeBlendPrice(resolveEffectivePricing(model.pricing, official));
}

export function makeOfficialGetter(models: OfficialPriceModel[]): OfficialGetter {
  const index = indexOfficialPricing(models);
  return (m: ArtificialAnalysisModel) => matchOfficialPricing(index, m);
}

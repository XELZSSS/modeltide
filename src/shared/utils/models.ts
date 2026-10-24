import type { ArtificialAnalysisModel } from "@/shared/types/catalog";
import { isFiniteNumber } from "./number";
import { providerDotColor } from "./color";
import type { ModelSource } from "@/shared/types/app";

export function getOutputSpeed(model: ArtificialAnalysisModel): number | null {
  return model.speed?.median_output_speed ?? null;
}

export function modelId(m: { id?: string; slug?: string }): string {
  return m.id || m.slug || "";
}

export function encodeModelIdPath(id: string): string {
  return id
    .replace(/^\/+/, "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function modelDetailPath(source: ModelSource, id: string): string {
  return `/model/${source}/${encodeModelIdPath(id)}`;
}

/** The detail link for a row, or `undefined` when its id is blank (a row with no id gets no link). Every caller passes a
 * `string` id — `modelId`, `item.id` and the row-id helpers all return `string` — so the parameter is narrowed to that. */
export function modelDetailHref(source: ModelSource, id: string): string | undefined {
  const key = id.trim();
  return key ? modelDetailPath(source, key) : undefined;
}

/** The Artificial Analysis page for a model slug — the only place that URL is assembled. */
export function aaModelPageUrl(site: string, modelSlug: string): string {
  return `${site}/models/${encodeURIComponent(modelSlug)}`;
}

/**
 * Row id → position in the delivered ranking. Every ranking payload arrives sorted, so the array order *is* the ranking;
 * the first occurrence of an id wins, which is what keeps a duplicated row from renumbering the rows below it.
 */
export function rankMapOf<T>(rows: readonly T[], idOf: (row: T) => string): Map<string, number> {
  const ranks = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const id = idOf(rows[i]!);
    if (id && !ranks.has(id)) ranks.set(id, i + 1);
  }
  return ranks;
}

export function shortModelId(id: string | null | undefined): string {
  if (typeof id !== "string" || !id) return "";
  return id.split("/").pop() || id;
}

export function modelDisplayName(m: { short_name?: string | null; name?: string | null } | null | undefined): string {
  return m?.short_name || m?.name || "";
}

function groupByProvider(models: ArtificialAnalysisModel[], unknownLabel: string) {
  const providers = new Map<string, { name: string; color: string | null; models: ArtificialAnalysisModel[] }>();
  for (const m of models) {
    const name = m.model_creators?.name || unknownLabel;
    const color = m.model_creators?.color ?? null;
    let bucket = providers.get(name);
    if (!bucket) {
      bucket = { name, color, models: [] };
      providers.set(name, bucket);
    }
    bucket.models.push(m);
  }
  return Array.from(providers.values());
}

function avg(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface ProviderStats {
  name: string;
  color: string;
  count: number;
  avgInputPrice: number | null;
  avgSpeed: number | null;
  avgIntelligence: number | null;
}

export function computeProviderStats(models: ArtificialAnalysisModel[], unknownLabel: string): ProviderStats[] {
  const usedColors = new Set<string>();
  return groupByProvider(models, unknownLabel)
    .map(({ name, color, models: group }) => {
      const count = group.length;
      const prices = group.map((m) => m.pricing?.input).filter(isFiniteNumber);
      const avgInputPrice = avg(prices);
      const avgSpeed = avg(group.map(getOutputSpeed).filter(isFiniteNumber));
      const avgIntelligence = avg(group.map((m) => m.intelligence_index).filter(isFiniteNumber));
      return {
        name,
        color: providerDotColor(color, name, usedColors),
        count,
        avgInputPrice,
        avgSpeed,
        avgIntelligence,
      };
    })
    .sort((a, b) => b.count - a.count);
}

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

/** The detail link for a row, or `undefined` when its id is blank; every caller passes a `string` id, so the parameter is narrowed to that. */
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
export interface ProviderStats {
  name: string;
  color: string;
  count: number;
  avgInputPrice: number | null;
  avgSpeed: number | null;
  avgIntelligence: number | null;
}

/**
 * Per-provider averages, accumulated in a single pass over each group: the sums are added in the same group order the
 * `reduce` behind `avg` used, so the floating-point result is identical to the six arrays it replaced.
 */
function averageOf<T>(group: readonly T[], read: (row: T) => number | null | undefined): number | null {
  let sum = 0;
  let count = 0;
  for (const row of group) {
    const value = read(row);
    if (!isFiniteNumber(value)) continue;
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

export function computeProviderStats(models: ArtificialAnalysisModel[], unknownLabel: string): ProviderStats[] {
  const usedColors = new Set<string>();
  const stats = groupByProvider(models, unknownLabel).map(({ name, color, models: group }) => ({
    name,
    color: providerDotColor(color, name, usedColors),
    count: group.length,
    avgInputPrice: averageOf(group, (m) => m.pricing?.input),
    avgSpeed: averageOf(group, getOutputSpeed),
    avgIntelligence: averageOf(group, (m) => m.intelligence_index),
  }));
  stats.sort((a, b) => b.count - a.count);
  return stats;
}

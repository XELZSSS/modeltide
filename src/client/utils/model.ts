import type { ArtificialAnalysisModel } from "@/shared/types";
import { isFiniteNumber } from "@/shared/utils";
import { getOutputSpeed } from "@/client/utils/cost-estimator";
import type { ModelSource } from "@/shared/config";

export function modelId(m: { id?: string; slug?: string }): string {
  return m.id || m.slug || "";
}

export function modelDetailPath(source: ModelSource, id: string): string {
  const encoded = id
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/model/${source}/${encoded}`;
}

export function shortModelId(id: string | null | undefined): string {
  if (typeof id !== "string" || !id) return "";
  return id.split("/").pop() || id;
}

function groupByProvider(models: ArtificialAnalysisModel[], unknownLabel = "Unknown") {
  const providers = new Map<string, { name: string; color: string; models: ArtificialAnalysisModel[] }>();
  for (const m of models) {
    const name = m.model_creators?.name || unknownLabel;
    const color = m.model_creators?.color || "var(--text-tertiary)";
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
  avgPrice: number | null;
  avgSpeed: number | null;
  avgIntelligence: number | null;
}

export function computeProviderStats(models: ArtificialAnalysisModel[], unknownLabel = "Unknown"): ProviderStats[] {
  const finite = isFiniteNumber;
  return groupByProvider(models, unknownLabel)
    .map(({ name, color, models: group }) => {
      const count = group.length;
      const avgPrice = avg(group.map((m) => m.pricing?.input).filter(finite));
      const avgSpeed = avg(group.map(getOutputSpeed).filter(finite));
      const avgIntelligence = avg(group.map((m) => m.intelligence_index).filter(finite));
      return { name, color, count, avgPrice, avgSpeed, avgIntelligence };
    })
    .sort((a, b) => b.count - a.count);
}

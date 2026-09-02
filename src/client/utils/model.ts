import type { ArtificialAnalysisModel } from "@/shared/types";
import type { ModelSource } from "@/shared/config";

export function modelId(m: { id?: string; slug?: string }): string {
  return m.id || m.slug || "";
}

export function modelDetailPath(source: ModelSource, id: string): string {
  return `/model/${source}/${id}`;
}

export function findModel<T>(data: T[], id: string, ...keys: (keyof T & string)[]): T | undefined {
  return data.find((item) => keys.some((key) => (item[key] as unknown) === id));
}

/** Last path segment of a repo-style id ("meta-llama/Llama-3" → "Llama-3"); falls back to the id itself. */
export function shortModelId(id: string): string {
  return id.split("/").pop() || id;
}

interface CostEstimateOptions {
  cacheHitRate?: number;
  reasoningTokens?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const nonNeg = (v: number) => Math.max(0, v);

function calcCost(
  pricing: ArtificialAnalysisModel["pricing"],
  promptTokens: number,
  completionTokens: number,
  opts?: CostEstimateOptions,
): number | null {
  if (!pricing || typeof pricing.input !== "number" || typeof pricing.output !== "number") return null;
  if (!Number.isFinite(pricing.input) || !Number.isFinite(pricing.output)) return null;
  const cacheRaw = pricing.cacheHit ?? pricing.cache_hit;
  if (cacheRaw !== undefined && cacheRaw !== null && !Number.isFinite(cacheRaw)) return null;
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  const hitRate = clamp01(opts?.cacheHitRate ?? 0);
  const cached = typeof cacheRaw === "number" ? cacheRaw : pricing.input;
  const inputRate = (1 - hitRate) * pricing.input + hitRate * cached;
  const reasoning = nonNeg(opts?.reasoningTokens ?? 0);
  return (
    (nonNeg(promptTokens) / 1_000_000) * inputRate +
    ((nonNeg(completionTokens) + reasoning) / 1_000_000) * pricing.output
  );
}

interface MonthlyCostOptions {
  dailyInput: number;
  dailyOutput: number;
  dailyReasoning?: number;
  cacheHitRate: number;
  daysPerMonth: number;
}

export function calcMonthlyCost(model: ArtificialAnalysisModel, opts: MonthlyCostOptions): number | null {
  const daily = calcCost(model.pricing, opts.dailyInput, opts.dailyOutput, {
    cacheHitRate: opts.cacheHitRate,
    reasoningTokens: opts.dailyReasoning,
  });
  return daily == null ? null : daily * Math.max(1, opts.daysPerMonth);
}

export function getOutputSpeed(model: ArtificialAnalysisModel): number | null {
  return model.speed?.median_output_speed ?? null;
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
  return groupByProvider(models, unknownLabel)
    .map(({ name, color, models: group }) => {
      const count = group.length;
      const avgPrice = avg(group.map((m) => m.pricing?.input).filter((p): p is number => p != null));
      const avgSpeed = avg(group.map(getOutputSpeed).filter((s): s is number => s != null));
      const avgIntelligence = avg(group.map((m) => m.intelligence_index).filter((i): i is number => i != null));
      return { name, color, count, avgPrice, avgSpeed, avgIntelligence };
    })
    .sort((a, b) => b.count - a.count);
}

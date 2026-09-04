export * from "@/shared/utils";
import { computeBlendPrice, normalizeModelKey } from "@/shared/utils";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BENCHMARK_LABELS, ONE_MINUTE, ONE_HOUR, ONE_DAY, type ModelSource } from "@/shared/config";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";

// ---- cn ----
/** Merges class names and resolves Tailwind class conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---- format ----
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  // Allow app-relative links; only external URLs need protocol validation.
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return trimmed;
  } catch (e) {
    console.warn("[format] invalid URL:", e);
    return undefined;
  }
  return undefined;
}

export function formatBoolean(t: TFunction, value?: boolean | null) {
  if (value === true) return t("yes");
  if (value === false) return t("no");
  return t("notAvailable");
}

function compactParts(n: number) {
  const abs = Math.abs(n);
  return { abs, k: abs / 1e3, m: abs / 1e6, b: abs / 1e9, t: abs / 1e12, sign: n < 0 ? "-" : "" };
}

// Threshold where rounding promotes to the next unit.
const PROMOTE_2DEC = 999.995;
const PROMOTE_1DEC = 999.95;

const strip1Dec = (v: number, suffix: string) => {
  const out = v.toFixed(1);
  return `${out.endsWith(".0") ? out.slice(0, -2) : out}${suffix}`;
};

export function formatShortNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  const { abs, k, m, b, t, sign } = compactParts(n);
  if (b >= PROMOTE_2DEC) return `${sign}${t.toFixed(2)}T`;
  if (m >= PROMOTE_2DEC) return `${sign}${b.toFixed(2)}B`;
  if (k >= PROMOTE_2DEC) return `${sign}${m.toFixed(2)}M`;
  if (k >= 1) return `${sign}${k.toFixed(2)}K`;
  return `${sign}${abs}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return t ? t("notAvailable") : "N/A";
  const { k, m } = compactParts(n);
  if (m >= PROMOTE_1DEC) return strip1Dec(n / 1e9, "B");
  if (k >= PROMOTE_1DEC) return strip1Dec(m, "M");
  if (k >= 1) return strip1Dec(k, "K");
  return String(n);
}

export function formatScore(t: TFunction, n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return t("notAvailable");
  return n.toFixed(2);
}

/** Percent with one decimal; null falls back to "N/A". */
export function formatPercent(t: TFunction, v: number | null | undefined): string {
  return typeof v !== "number" || !Number.isFinite(v) ? t("notAvailable") : `${v.toFixed(1)}%`;
}

/** Uptime ratio in [0,1] as a two-decimal percentage. */
export function formatUptimePct(t: TFunction, v: number | null | undefined): string {
  return typeof v !== "number" || !Number.isFinite(v) ? t("uptimeNoData") : `${(v * 100).toFixed(2)}%`;
}

/** Output speed in tokens/s at one decimal. */
export function formatSpeed(t: TFunction, v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatIndex(v) : t("notAvailable");
}

/** Number at one decimal with digit grouping. */
export function formatIndex(v: number): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function usdString(v: number): string {
  let out = v.toFixed(2);
  if (v > 0 && Number(out) === 0) {
    out = v.toFixed(3);
    if (Number(out) === 0) out = v.toFixed(4);
  }
  return `$${out}`;
}

export function formatDollar(v: number | null | undefined, t?: TFunction): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return t?.("notAvailable") ?? "N/A";
  return usdString(v);
}

export function formatPricePerMillion(v: number | null | undefined, t?: TFunction): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return t ? t("notAvailable") : "N/A";
  return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (typeof change !== "number" || !Number.isFinite(change)) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

const CAT_MAP: Record<string, TranslationKey> = {
  coding: "catCoding",
  reasoning: "catReasoning",
} as const satisfies Record<string, TranslationKey>;

export function categoryLabel(cat: string, t: TFunction): string {
  return t(CAT_MAP[cat] ?? "catGeneral");
}

export function formatRelativeTime(isoString: string, t: TFunction): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return t("timeJustNow");
  const diffMins = Math.floor(diffMs / ONE_MINUTE);
  if (diffMins < 1) return t("timeJustNow");
  if (diffMins < 60) return t("timeMinutesAgo", { value: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("timeHoursAgo", { value: diffHours });
  return t("timeDaysAgo", { value: Math.floor(diffHours / 24) });
}

function localeOf(lang: string): string {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export function formatDate(isoString: string | number | Date, lang: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return String(isoString);
  // Local timezone: UTC rendering shifted Chinese-evening dates a day behind.
  return date.toLocaleDateString(localeOf(lang));
}
export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}

export function benchmarkLabel(key: string, t: TFunction): string {
  const labelKey = (BENCHMARK_LABELS as Record<string, TranslationKey>)[key];
  return labelKey ? t(labelKey) : key;
}

export function formatUptime(t: TFunction, ms: number): string {
  const days = Math.floor(ms / ONE_DAY);
  const hours = Math.floor((ms % ONE_DAY) / ONE_HOUR);
  const mins = Math.floor((ms % ONE_HOUR) / ONE_MINUTE);
  if (days > 0) return t("uptimeDays", { days, hours });
  if (hours > 0) return t("uptimeHours", { hours, mins });
  return t("uptimeMins", { mins });
}

// ---- model ----
export function modelId(m: { id?: string; slug?: string }): string {
  return m.id || m.slug || "";
}

export function modelDetailPath(source: ModelSource, id: string): string {
  return `/model/${source}/${id}`;
}

/** Last path segment of a repo-style id ("org/Model" → "Model"). */
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

export function calcMonthlyCost(
  model: ArtificialAnalysisModel,
  opts: MonthlyCostOptions,
  official?: OfficialPriceModel | null,
): number | null {
  const pricing = official ? resolveEffectivePricing(model.pricing, official) : model.pricing;
  const daily = calcCost(pricing, opts.dailyInput, opts.dailyOutput, {
    cacheHitRate: opts.cacheHitRate,
    reasoningTokens: opts.dailyReasoning,
  });
  return daily == null ? null : daily * Math.max(1, opts.daysPerMonth);
}

// ---- pricing ----
/** First-party official rates win over catalog legs, per leg. */
export type PriceAuthority = "official" | "catalog";

export interface EffectivePricing {
  input: number | null;
  output: number | null;
  cache_hit: number | null;
  source: PriceAuthority | null;
}

export type OfficialGetter = (model: ArtificialAnalysisModel) => OfficialPriceModel | undefined;

const finiteOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Exact normalized-key index over the official id + name. */ export function indexOfficialPricing(
  models: OfficialPriceModel[],
): Map<string, OfficialPriceModel> {
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

/** Exact match only — fuzzy matches could attach a sibling model's rate. */
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

/** Per-leg merge: official legs win, catalog fills gaps. */
export function resolveEffectivePricing(
  catalog: ArtificialAnalysisModel["pricing"],
  official?: OfficialPriceModel | null,
): EffectivePricing {
  const input = finiteOrNull(official?.input) ?? finiteOrNull(catalog?.input);
  const output = finiteOrNull(official?.output) ?? finiteOrNull(catalog?.output);
  const cacheHit =
    finiteOrNull(official?.cachedInput) ?? finiteOrNull(catalog?.cacheHit) ?? finiteOrNull(catalog?.cache_hit);
  if (input == null && output == null) return { input, output, cache_hit: cacheHit, source: null };
  return { input, output, cache_hit: cacheHit, source: official ? "official" : "catalog" };
}

/** Blended rate from effective (official-first) legs; catalog figure as fallback. */
export function resolveBlendedPrice(
  model: ArtificialAnalysisModel,
  official?: OfficialPriceModel | null,
): number | null {
  if (!official) return model.blended_price ?? null;
  return computeBlendPrice(resolveEffectivePricing(model.pricing, official)) ?? model.blended_price ?? null;
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

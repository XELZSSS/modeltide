import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { approxEq, normalizePercent } from "@/shared/utils";
import { formatBoolean, formatScore, formatPercent, formatSpeed } from "@/client/utils/format";
import { getOutputSpeed } from "@/client/utils/cost-estimator";
import { modelId } from "@/client/utils/model";
import { resolveEffectivePricing, type EffectivePricing, type OfficialGetter } from "@/client/utils/pricing-merge";
import { ceilToStep } from "@/client/theme/chart-theme";
export interface CompareRow<T> {
  id?: string;
  label: string;
  getValue?: (m: T) => string;
  getNumeric?: (m: T) => number | null | undefined;
  bestIs?: "max" | "min";
  worstIs?: "max" | "min";
}

export type Winner = "win" | "loss";

export const rowKey = <T>(row: CompareRow<T>): string => row.id ?? row.label;

export function computeWinners<T>(
  rows: CompareRow<T>[],
  models: T[],
  getKey: (m: T, index: number) => string,
): Map<string, Map<string, Winner>> {
  const winners = new Map<string, Map<string, Winner>>();
  for (const row of rows) {
    const perModel = decideRowWinners(row, models, getKey);
    if (perModel) winners.set(rowKey(row), perModel);
  }
  return winners;
}

function collectNumeric<T>(
  row: CompareRow<T>,
  models: T[],
  getKey: (m: T, index: number) => string,
): { key: string; val: number }[] | null {
  if (!row.getNumeric || !row.bestIs) return null;
  // 4 decimals, matching the formatter: rounding to 2 tied sub-cent prices.
  const atDisplayPrecision = (v: number) => Math.round(v * 10000) / 10000;
  const values = models
    .map((model, index) => ({ key: getKey(model, index), val: row.getNumeric!(model) }))
    .filter((v): v is { key: string; val: number } => typeof v.val === "number" && Number.isFinite(v.val))
    .map((v) => ({ ...v, val: atDisplayPrecision(v.val) }));
  return values.length >= 2 ? values : null;
}

function pickExtreme(values: { val: number }[], which: "max" | "min"): number {
  const nums = values.map((v) => v.val);
  return which === "min" ? Math.min(...nums) : Math.max(...nums);
}

function decideRowWinners<T>(
  row: CompareRow<T>,
  models: T[],
  getKey: (m: T, index: number) => string,
): Map<string, Winner> | null {
  const values = collectNumeric(row, models, getKey);
  if (!values || !row.bestIs) return null;
  const best = pickExtreme(values, row.bestIs);
  if (values.every((v) => approxEq(v.val, best))) return null;
  const perModel = new Map<string, Winner>();
  for (const v of values) if (approxEq(v.val, best)) perModel.set(v.key, "win");
  if (row.worstIs) {
    const worst = pickExtreme(values, row.worstIs);
    for (const v of values) if (!perModel.has(v.key) && approxEq(v.val, worst)) perModel.set(v.key, "loss");
  }
  return perModel;
}

function metric(
  t: TFunction,
  labelKey: Parameters<TFunction>[0],
  getScore: (m: ArtificialAnalysisModel) => number | null | undefined,
  pct = false,
): CompareRow<ArtificialAnalysisModel> {
  const value = pct ? (m: ArtificialAnalysisModel) => normalizePercent(getScore(m)) : getScore;
  return {
    id: labelKey,
    label: t(labelKey),
    getValue: pct ? (m) => formatPercent(t, value(m)) : (m) => formatScore(t, getScore(m)),
    getNumeric: value,
    bestIs: "max",
    worstIs: "min",
  };
}

function nonNegative(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, v);
}

/**
 * `intelligence_index` is the one AA metric the server stores raw.
 * `coding_index` and `agentic_index` are already percent-normalized server-side
 * (parsers/aa/compact.ts), so running the fraction heuristic on them again
 * multiplied any sub-1% score by 100.
 */
function rawIndexScore(v: number | null | undefined): number | null {
  const scaled = v != null && v > 0 && v <= 1 ? v * 100 : v;
  return nonNegative(scaled);
}

export interface RadarRow {
  metric: string;
  /** Keyed by modelId() so a filtered or reordered model list can't shift values onto the wrong model. */
  values: Record<string, number | null>;
}

export function buildRadarData(t: TFunction, models: ArtificialAnalysisModel[]): RadarRow[] {
  return [
    { metric: t("intelligence"), getValue: (m: ArtificialAnalysisModel) => rawIndexScore(m.intelligence_index) },
    { metric: t("coding"), getValue: (m: ArtificialAnalysisModel) => nonNegative(m.coding_index) },
    { metric: t("agentic"), getValue: (m: ArtificialAnalysisModel) => nonNegative(m.agentic_index) },
    { metric: t("gpqa"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.gpqa) },
    { metric: t("hle"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.hle) },
    { metric: t("scicode"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.scicode) },
    { metric: t("ifbench"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.ifbench) },
  ].map(({ metric, getValue }) => {
    const values: Record<string, number | null> = {};
    for (const model of models) {
      const key = modelId(model);
      if (!key || key in values) continue;
      const val = getValue(model);
      values[key] = val != null ? Number(val.toFixed(2)) : null;
    }
    return { metric, values };
  });
}

export function radarMaxFor(rows: RadarRow[], fallback = 100): number {
  let peak = fallback;
  for (const row of rows) {
    for (const value of Object.values(row.values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value > peak) peak = value;
    }
  }
  return ceilToStep(peak, 20);
}

export function buildPriceRows(t: TFunction, getOfficial?: OfficialGetter): CompareRow<ArtificialAnalysisModel>[] {
  const leg = (pick: (pricing: EffectivePricing) => number | null) => (m: ArtificialAnalysisModel) =>
    pick(resolveEffectivePricing(m.pricing, getOfficial?.(m)));
  return [
    { id: "promptPrice", label: t("promptPrice"), getNumeric: leg((p) => p.input), bestIs: "min", worstIs: "max" },
    {
      id: "completionPrice",
      label: t("completionPrice"),
      getNumeric: leg((p) => p.output),
      bestIs: "min",
      worstIs: "max",
    },
    {
      id: "cacheHitPrice",
      label: t("cacheHitPrice"),
      getNumeric: leg((p) => p.cacheHit),
      bestIs: "min",
      worstIs: "max",
    },
    {
      id: "cacheWritePrice",
      label: t("cacheWritePrice"),
      getNumeric: leg((p) => p.cacheWrite),
      bestIs: "min",
      worstIs: "max",
    },
  ];
}

export function buildCompareRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  return [
    {
      id: "creator",
      label: t("creator"),
      getValue: (model) => model.model_creators?.name || t("notAvailable"),
    },
    {
      id: "releaseDate",
      label: t("releaseDate"),
      getValue: (model) => model.release_date || t("notAvailable"),
    },
    metric(t, "intelligenceIndex", (m) => m.intelligence_index),
    metric(t, "coding", (m) => m.coding_index),
    metric(t, "agentic", (m) => m.agentic_index),
    metric(t, "gpqa", (m) => m.benchmarks?.gpqa, true),
    metric(t, "hle", (m) => m.benchmarks?.hle, true),
    metric(t, "scicode", (m) => m.benchmarks?.scicode, true),
    metric(t, "ifbench", (m) => m.benchmarks?.ifbench, true),
    {
      id: "outputSpeed",
      label: t("outputSpeed"),
      getValue: (model) => formatSpeed(t, getOutputSpeed(model)),
      getNumeric: getOutputSpeed,
      bestIs: "max",
      worstIs: "min",
    },
    {
      id: "openWeights",
      label: t("openWeights"),
      getValue: (model) => formatBoolean(t, model.is_open_weights),
    },
  ];
}

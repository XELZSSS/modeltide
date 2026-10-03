import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { approxEq, unclampedPercent } from "@/shared/utils";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing, PRICE_LEG_IDS, PRICE_LEGS, type PriceLegPick } from "@/shared/utils/pricing";
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

export const modelKeyOf = (m: ArtificialAnalysisModel, index: number) => modelId(m) || `idx-${index}`;

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
  const values = models
    .map((model, index) => ({ key: getKey(model, index), val: row.getNumeric!(model) }))
    .filter((v): v is { key: string; val: number } => typeof v.val === "number" && Number.isFinite(v.val));
  return values.length >= 2 ? values : null;
}

function pickExtreme(values: { val: number }[], which: "max" | "min"): number {
  let extreme = values[0]!.val;
  for (let i = 1; i < values.length; i++) {
    const val = values[i]!.val;
    if (which === "min" ? val < extreme : val > extreme) extreme = val;
  }
  return extreme;
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

function nonNegative(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, v);
}

interface RadarRow {
  metric: string;
  values: Record<string, number | null>;
}

function radarMetricGetters(
  t: TFunction,
): readonly { metric: string; getValue: (m: ArtificialAnalysisModel) => number | null }[] {
  return [
    { metric: t("intelligence"), getValue: (m: ArtificialAnalysisModel) => nonNegative(m.intelligence_index) },
    { metric: t("coding"), getValue: (m: ArtificialAnalysisModel) => nonNegative(m.coding_index) },
    { metric: t("agentic"), getValue: (m: ArtificialAnalysisModel) => nonNegative(m.agentic_index) },
    { metric: t("gpqa"), getValue: (m: ArtificialAnalysisModel) => unclampedPercent(m.benchmarks?.gpqa) },
    { metric: t("hle"), getValue: (m: ArtificialAnalysisModel) => unclampedPercent(m.benchmarks?.hle) },
    { metric: t("scicode"), getValue: (m: ArtificialAnalysisModel) => unclampedPercent(m.benchmarks?.scicode) },
    { metric: t("ifbench"), getValue: (m: ArtificialAnalysisModel) => unclampedPercent(m.benchmarks?.ifbench) },
  ];
}

function buildRadarRows(t: TFunction, models: ArtificialAnalysisModel[], keys: readonly string[]): RadarRow[] {
  return radarMetricGetters(t).map(({ metric, getValue }) => {
    const values: Record<string, number | null> = {};
    for (let i = 0; i < models.length; i++) {
      const key = keys[i]!;
      if (!key || key in values) continue;
      const val = getValue(models[i]!);
      values[key] = val != null ? Number(val.toFixed(2)) : null;
    }
    return { metric, values };
  });
}

export function buildRadarData(t: TFunction, models: ArtificialAnalysisModel[]): RadarRow[] {
  return buildRadarRows(
    t,
    models,
    models.map((model) => modelId(model)),
  );
}

export function radarMaxFor(rows: RadarRow[], fallback = 100): number {
  let peak = fallback;
  for (const row of rows) {
    for (const value of Object.values(row.values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value > peak) peak = value;
    }
  }
  return ceilToStep(peak);
}

interface CompareValueRow {
  metric: string;
  values: (number | null)[];
}

export function buildValueRows(t: TFunction, models: ArtificialAnalysisModel[]): CompareValueRow[] {
  const keys = models.map((model) => modelId(model));
  return buildRadarRows(t, models, keys).map((row) => ({
    metric: row.metric,
    values: keys.map((key) => (key ? (row.values[key] ?? null) : null)),
  }));
}

export function buildPriceRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  const leg = (pick: PriceLegPick) => (m: ArtificialAnalysisModel) => pick(resolveEffectivePricing(m.pricing));
  return PRICE_LEG_IDS.map((id): CompareRow<ArtificialAnalysisModel> => ({
    id,
    label: t(id),
    getNumeric: leg(PRICE_LEGS[id]),
    bestIs: "min",
    worstIs: "max",
  }));
}

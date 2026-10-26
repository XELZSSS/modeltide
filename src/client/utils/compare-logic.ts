import type { TFunction, TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { approxEq } from "@/shared/utils";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing, PRICE_LEG_IDS, PRICE_LEGS, type PriceLegPick } from "@/shared/utils/pricing";
import { ceilToStep } from "@/client/charts/theme";
export interface CompareRow<T> {
  // Every row both builders produce carries `id`, `label`, `getNumeric` and `bestIs`, so those are required: the optional
  // variants and the `?? row.label` fallback they fed are dead. `worstIs` is the one that differs — only the price rows
  // set it — so it stays optional. `getValue` is never written or read anywhere and is gone.
  id: string;
  label: string;
  getNumeric: (m: T) => number | null | undefined;
  bestIs: "max" | "min";
  worstIs?: "max" | "min";
}

export type Winner = "win" | "loss";

export const rowKey = <T>(row: CompareRow<T>): string => row.id;

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
  const values = models
    .map((model, index) => ({ key: getKey(model, index), val: row.getNumeric(model) }))
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
  if (!values) return null;
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

/**
 * The metrics the radar plots *and* the table below it lists. One table, because the two are read together: a metric
 * added to one of two hand-written lists is a metric the other one silently lacks. Only 0..100 values belong here — the
 * indexes as they are, and a benchmark ratio through `percentOf`, because the benchmarks themselves are stored exactly
 * as the upstream sent them (0-1) and one axis cannot carry both 0.83 and 1500.
 */
const percentOf = (v: number | null | undefined): number | null => (v == null ? null : Math.min(100, v * 100));

const COMPARE_METRICS: readonly {
  id: TranslationKey;
  get: (m: ArtificialAnalysisModel) => number | null;
}[] = [
  { id: "intelligence", get: (m) => nonNegative(m.intelligence_index) },
  { id: "coding", get: (m) => nonNegative(m.coding_index) },
  { id: "agentic", get: (m) => nonNegative(m.agentic_index) },
  { id: "gpqa", get: (m) => percentOf(m.benchmarks?.gpqa) },
  { id: "hle", get: (m) => percentOf(m.benchmarks?.hle) },
  { id: "scicode", get: (m) => percentOf(m.benchmarks?.scicode) },
  { id: "ifbench", get: (m) => percentOf(m.benchmarks?.ifbench) },
];

function buildRadarRows(t: TFunction, models: ArtificialAnalysisModel[], keys: readonly string[]): RadarRow[] {
  return COMPARE_METRICS.map(({ id, get }) => {
    const values: Record<string, number | null> = {};
    for (let i = 0; i < models.length; i++) {
      const key = keys[i]!;
      if (!key || key in values) continue;
      const val = get(models[i]!);
      values[key] = val != null ? Number(val.toFixed(2)) : null;
    }
    return { metric: t(id), values };
  });
}

export function buildRadarData(t: TFunction, models: ArtificialAnalysisModel[]): RadarRow[] {
  return buildRadarRows(
    t,
    models,
    models.map((model) => modelId(model)),
  );
}

// The single caller (the radar) always wants the 0..100 axis floor, so `fallback` was an untaken knob; it is inlined.
export function radarMaxFor(rows: RadarRow[]): number {
  let peak = 100;
  for (const row of rows) {
    for (const value of Object.values(row.values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value > peak) peak = value;
    }
  }
  return ceilToStep(peak);
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

/**
 * The model-comparison metric rows: the entries the radar plots, listed so a reader can read the numbers the chart can
 * only draw. `bestIs: "max"` is what marks a row's winner.
 */
export function buildMetricRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  return COMPARE_METRICS.map(({ id, get }) => ({ id, label: t(id), getNumeric: get, bestIs: "max" }));
}

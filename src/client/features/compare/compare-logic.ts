import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { approxEq, normalizePercent } from "@/shared/utils";
import { priceDisplayPrecision } from "@/client/utils/format";
import { modelId } from "@/client/utils/model-utils";
import {
  resolveEffectivePricing,
  PRICE_LEGS,
  type PriceLegId,
  type PriceLegPick,
} from "@/client/utils/pricing";
import { ceilToStep } from "@/client/theme/chart-theme";
export interface CompareRow<T> {
  id?: string;
  label: string;
  getValue?: (m: T) => string;
  getNumeric?: (m: T) => number | null | undefined;
  /** Winners are decided on values quantized to these decimals, so two cells printing
   *  the same text can never be marked against each other. */
  displayDecimals?: number | ((v: number) => number);
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
  const decimals = row.displayDecimals ?? priceDisplayPrecision;
  const atDisplayPrecision = (v: number) => Number(v.toFixed(typeof decimals === "function" ? decimals(v) : decimals));
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

function nonNegative(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, v);
}

/** `intelligence_index` is the one AA metric the server stores raw; the rest are already percent-normalized. */
function rawIndexScore(v: number | null | undefined): number | null {
  const scaled = v != null && v > 0 && v <= 1 ? v * 100 : v;
  return nonNegative(scaled);
}

interface RadarRow {
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

interface CompareValueRow {
  metric: string;
  /** One score per compared model, in model order; null where that model has none. */
  values: (number | null)[];
}

export function buildValueRows(t: TFunction, models: ArtificialAnalysisModel[]): CompareValueRow[] {
  const keys = models.map((model) => modelId(model));
  return buildRadarData(t, models).map((row) => ({
    metric: row.metric,
    values: keys.map((key) => (key ? (row.values[key] ?? null) : null)),
  }));
}

const PRICE_LEG_ORDER: PriceLegId[] = ["promptPrice", "completionPrice", "cacheHitPrice", "cacheWritePrice"];

export function buildPriceRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  const leg = (pick: PriceLegPick) => (m: ArtificialAnalysisModel) => pick(resolveEffectivePricing(m.pricing));
  return PRICE_LEG_ORDER.map((id): CompareRow<ArtificialAnalysisModel> => ({
    id,
    label: t(id),
    getNumeric: leg(PRICE_LEGS[id]),
    bestIs: "min",
    worstIs: "max",
  }));
}

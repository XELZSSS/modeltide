import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { approxEq, normalizePercent } from "@/shared/utils";
import { formatBoolean, formatScore, formatPercent, formatSpeed } from "@/client/utils";
import { getOutputSpeed } from "@/client/utils";

/** A single comparable metric row. */
export interface CompareRow<T> {
  /** Stable row identity for winner maps; defaults to `label` when omitted. */
  id?: string;
  label: string;
  getValue?: (m: T) => string;
  getNumeric?: (m: T) => number | null | undefined;
  bestIs?: "max" | "min";
  worstIs?: "max" | "min";
}

export type Winner = "win" | "loss";

/**
 * Per-metric winners: models equal to the best value (at display precision)
 * are "win", the worst "loss". Skips rows with < 2 values and full ties.
 */
export function computeWinners<T>(
  rows: CompareRow<T>[],
  models: T[],
  getKey: (m: T, index: number) => string,
): Map<string, Map<string, Winner>> {
  const winners = new Map<string, Map<string, Winner>>();
  // Display precision: values rendering identically must not split win/loss.
  const atDisplayPrecision = (v: number) => Math.round(v * 10) / 10;
  for (const row of rows) {
    const accessor = row.getNumeric;
    if (!accessor || !row.bestIs) continue;
    const rowKey = row.id ?? row.label;
    const values = models
      .map((model, index) => ({ key: getKey(model, index), val: accessor(model) }))
      .filter((v): v is { key: string; val: number } => typeof v.val === "number" && Number.isFinite(v.val))
      .map((v) => ({ ...v, val: atDisplayPrecision(v.val) }));
    if (values.length < 2) continue;
    const best = row.bestIs === "min" ? Math.min(...values.map((v) => v.val)) : Math.max(...values.map((v) => v.val));
    if (values.every((v) => approxEq(v.val, best))) continue;
    const perModel = new Map<string, Winner>();
    for (const v of values) if (approxEq(v.val, best)) perModel.set(v.key, "win");
    if (row.worstIs) {
      const worst =
        row.worstIs === "min" ? Math.min(...values.map((v) => v.val)) : Math.max(...values.map((v) => v.val));
      for (const v of values) if (!perModel.has(v.key) && approxEq(v.val, worst)) perModel.set(v.key, "loss");
    }
    winners.set(rowKey, perModel);
  }
  return winners;
}

function scoreMetric(
  t: TFunction,
  labelKey: Parameters<TFunction>[0],
  getScore: (m: ArtificialAnalysisModel) => number | null | undefined,
): CompareRow<ArtificialAnalysisModel> {
  return {
    id: labelKey,
    label: t(labelKey),
    getValue: (model) => formatScore(t, getScore(model)),
    getNumeric: getScore,
    bestIs: "max",
    worstIs: "min",
  };
}

function percentMetric(
  t: TFunction,
  labelKey: Parameters<TFunction>[0],
  getScore: (m: ArtificialAnalysisModel) => number | null | undefined,
): CompareRow<ArtificialAnalysisModel> {
  return {
    id: labelKey,
    label: t(labelKey),
    getValue: (m) => formatPercent(t, normalizePercent(getScore(m))),
    getNumeric: (m) => normalizePercent(getScore(m)),
    bestIs: "max",
    worstIs: "min",
  };
}

/** Raw radar values without the 0-100 clamp: intelligence can exceed 100. */
function rawScore(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const scaled = v > 0 && v <= 1 ? v * 100 : v;
  return Math.max(0, scaled);
}

export function buildRadarData(t: TFunction, models: ArtificialAnalysisModel[]) {
  return [
    { metric: t("intelligence"), getValue: (m: ArtificialAnalysisModel) => rawScore(m.intelligence_index) },
    { metric: t("coding"), getValue: (m: ArtificialAnalysisModel) => rawScore(m.coding_index) },
    { metric: t("agentic"), getValue: (m: ArtificialAnalysisModel) => rawScore(m.agentic_index) },
    { metric: t("gpqa"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.gpqa) },
    { metric: t("hle"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.hle) },
    { metric: t("scicode"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.scicode) },
    { metric: t("ifbench"), getValue: (m: ArtificialAnalysisModel) => normalizePercent(m.benchmarks?.ifbench) },
  ].map((metric) => {
    const row: Record<string, string | number | null> = { metric: metric.metric };
    models.forEach((model, index) => {
      const val = metric.getValue(model);
      row[`model_${index}`] = val != null ? Number(val.toFixed(2)) : null;
    });
    return row;
  });
}

/** Dynamic radar ceiling: 100 default, grows in 20-steps when data exceeds it. */
export function radarMaxFor(data: Record<string, string | number | null>[], fallback = 100): number {
  let peak = fallback;
  for (const row of data) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "metric" || typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v > peak) peak = v;
    }
  }
  return Math.ceil(peak / 20) * 20;
}

/** Price rows (prompt/completion/cache-hit); lower is better. */
export function buildPriceRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  const cacheOf = (m: ArtificialAnalysisModel) => m.pricing?.cacheHit ?? m.pricing?.cache_hit;
  return [
    { label: t("promptPrice"), getNumeric: (m) => m.pricing?.input, bestIs: "min" },
    { label: t("completionPrice"), getNumeric: (m) => m.pricing?.output, bestIs: "min" },
    { label: t("cacheHitPrice"), getNumeric: cacheOf, bestIs: "min" },
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
    scoreMetric(t, "intelligenceIndex", (m) => m.intelligence_index),
    scoreMetric(t, "coding", (m) => m.coding_index),
    scoreMetric(t, "agentic", (m) => m.agentic_index),
    percentMetric(t, "gpqa", (m) => m.benchmarks?.gpqa),
    percentMetric(t, "hle", (m) => m.benchmarks?.hle),
    percentMetric(t, "scicode", (m) => m.benchmarks?.scicode),
    percentMetric(t, "ifbench", (m) => m.benchmarks?.ifbench),
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

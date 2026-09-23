import type { ArtificialAnalysisModel } from "@/shared/types";

export const SERIES_KEYS = ["intelligence_index", "coding_index"] as const;
export const SERIES_LABEL_KEYS = ["intelligence", "coding"] as const;
/** Models the chart shows, taken as the highest intelligence indices. */
const TOP_N = 10;

/** Both axes are drawn against the index scale: 0 → 100 in whole steps of 20. */
export const INDEX_AXIS_MAX = 100;
export const INDEX_AXIS_STEP = 20;

type IndexSeriesKey = (typeof SERIES_KEYS)[number];
type IndexRow = ArtificialAnalysisModel & Record<IndexSeriesKey, number>;

/** Only models carrying every plotted index qualify; kept as the `TOP_N` highest intelligence indices. */
export function buildIndexRows(models: readonly ArtificialAnalysisModel[]): IndexRow[] {
  const complete = models.filter((model): model is IndexRow =>
    SERIES_KEYS.every((key) => typeof model[key] === "number" && Number.isFinite(model[key])),
  );
  // `filter` already copied the array, so this sort cannot reach the caller's list.
  complete.sort((a, b) => b.intelligence_index - a.intelligence_index);
  return complete.slice(0, TOP_N);
}

export function indexAxisX(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * INDEX_AXIS_MAX;
}

/** Values arrive as floats, so two decimals: the precision the rest of the app shows these scores at. */
export function formatIndexValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(2)).toString();
}

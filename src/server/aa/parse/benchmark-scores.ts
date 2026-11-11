import { numCoerce } from "@/server/formats/scalars";
import { BENCHMARK_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey } from "@/shared/config";
import { ratioToPercent } from "@/shared/utils";
import { benchmarkWireName } from "./benchmark-fields";
import { fieldValue, type AaRow } from "../wire";

/**
 * The scoring rules of the projection, apart from the field list it feeds: how a 0-1 ratio is read, what leaves that
 * range, and how the two coding composites are built. This is the half that decides whether a number is kept — the one
 * place an upstream scale change turns into a warning instead of a `null`.
 */

/** Reports a field that is declared as a 0-1 ratio but arrived on another scale, so a drop is never silent. */
export type RatioWarn = (field: string, value: number) => void;

export function ratioScore(field: string, raw: number | null, warn?: RatioWarn): number | null {
  const percent = ratioToPercent(raw);
  if (percent == null && raw != null) warn?.(field, raw);
  return percent;
}

/**
 * A benchmark declared as a 0-1 ratio, kept exactly as the upstream sent it: the detail page exists to show the source
 * value. The bound is still checked, because a value outside it means the upstream changed scale (an Elo, a percentage).
 */
export function ratioAsIs(field: string, raw: number | null, warn?: RatioWarn): number | null {
  if (raw == null) return null;
  if (raw < 0 || raw > 1) {
    warn?.(field, raw);
    return null;
  }
  return raw;
}

export function compactBenchmarks(m: AaRow, warn?: RatioWarn): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const wire = benchmarkWireName(key);
    const raw = numCoerce(fieldValue(m, wire));
    const value = ABSOLUTE_SCORE_BENCHMARKS.has(key) ? raw : ratioAsIs(wire, raw, warn);
    if (value != null) benchmarks[key] = value;
  }
  return benchmarks;
}

/** Reads one projected benchmark as a 0-1 ratio: through the wire-name table and the alias-aware accessor. */
function compactRatio(m: AaRow, key: BenchmarkKey, warn?: RatioWarn): number | null {
  const wire = benchmarkWireName(key);
  return ratioScore(wire, numCoerce(fieldValue(m, wire)), warn);
}

export function compactCodingIndex(m: AaRow, warn?: RatioWarn): number | null {
  // Both terms are read by their `BenchmarkKey`: `benchmarkWireName` owns the upstream spelling and `fieldValue` honors the
  // alias table.
  const tb = compactRatio(m, "terminalbench_v2_1", warn);
  const sc = compactRatio(m, "scicode", warn);
  if (tb == null) return sc;
  if (sc == null) return tb;
  return (tb + sc) / 2;
}

import type { CostScenario } from "./utils/cost";

/** Ids of the cost-estimator inputs; the single list the store, the form and the parser all key off. */
export type CostFieldId =
  | "dailyInput"
  | "dailyOutput"
  | "dailyReasoning"
  | "cacheHitRate"
  | "cacheWriteRate"
  | "daysPerMonth";

export type CostFieldValues = Record<CostFieldId, string>;

/**
 * The estimator's starting values — and what a cleared field falls back to. They live here rather than in the store so the
 * parser that prices a scenario and the store that pre-fills the form cannot disagree about what an empty field means.
 */
export const DEFAULT_COST_FIELDS: CostFieldValues = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  cacheWriteRate: "5",
  daysPerMonth: "22",
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The one grammar a cost field accepts: a non-negative decimal, optionally left off at the point while typing. Exponential
 * text (`1e3`) and a sign are not it, and `fieldNumber` refuses exactly what the form flags, so a field the reader is told
 * is invalid cannot also be the number the estimate is priced from.
 */
const COST_FIELD_DECIMAL_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
export const isCostFieldInput = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed === "" || COST_FIELD_DECIMAL_RE.test(trimmed);
};

/**
 * One field's number. A blank field is not zero: the reader is mid-edit, or cleared the field to get the default back, and
 * pricing a blank "2M tokens/day" as 0 silently claims the model is free. Text the grammar above rejects — which is what a
 * hand-edited localStorage entry can hold — falls back the same way.
 */
function fieldNumber(raw: string, id: CostFieldId): number {
  const fallback = Number(DEFAULT_COST_FIELDS[id]);
  const text = raw.trim();
  if (!text || !COST_FIELD_DECIMAL_RE.test(text)) return fallback;
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

export function parseCostFields(values: CostFieldValues): CostScenario {
  return {
    dailyInputM: Math.max(0, fieldNumber(values.dailyInput, "dailyInput")),
    dailyOutputM: Math.max(0, fieldNumber(values.dailyOutput, "dailyOutput")),
    dailyReasoningM: Math.max(0, fieldNumber(values.dailyReasoning, "dailyReasoning")),
    cacheHitRate: clamp(fieldNumber(values.cacheHitRate, "cacheHitRate"), 0, 100) / 100,
    cacheWriteRate: clamp(fieldNumber(values.cacheWriteRate, "cacheWriteRate"), 0, 100) / 100,
    daysPerMonth: Math.max(1, fieldNumber(values.daysPerMonth, "daysPerMonth")),
  };
}

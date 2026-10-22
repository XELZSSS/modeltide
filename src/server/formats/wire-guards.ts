import { isRecord, isValidOpenRouterDirectoryRow } from "./parser-primitives";
import type { ModelRow, PricingRow } from "./wire-types";

export function isModelRow(value: unknown): value is ModelRow {
  return isRecord(value) && typeof value.model_permaslug === "string";
}

export function isPricingRow(value: unknown): value is PricingRow {
  return isValidOpenRouterDirectoryRow(value);
}

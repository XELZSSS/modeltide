import { isRecord } from "./scalars";
import { isValidOpenRouterDirectoryRow } from "./content-guards";
import type { ModelRow, PricingRow } from "./wire-types";

export function isModelRow(value: unknown): value is ModelRow {
  return isRecord(value) && typeof value.model_permaslug === "string";
}

export function isPricingRow(value: unknown): value is PricingRow {
  return isValidOpenRouterDirectoryRow(value);
}

export type { ModelRow } from "@/server/parsers/upstream";

export interface PricingEntry {
  input: number;
  output: number;
  cacheHit: number | null;
  cacheWrite: number | null;
}

export type PricingRecord = Record<string, PricingEntry>;

export interface ModelMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
}

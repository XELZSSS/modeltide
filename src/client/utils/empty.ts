import type { ArtificialAnalysisModel } from "@/shared/types";

// Shared frozen empty array for stable ComputedRef identity in pricing mode
// switches. MUST NOT be mutated — use emptyArray<T>() for fresh instances.
const frozen: ArtificialAnalysisModel[] = [];
Object.freeze(frozen);

export const EMPTY_MODELS: ArtificialAnalysisModel[] = frozen;

export function emptyArray<T>(): T[] {
  return [];
}

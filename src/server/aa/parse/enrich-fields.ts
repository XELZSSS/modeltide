import { modelsBenchmarkWireNames, omniscienceBenchmarkWireNames, presentAlias } from "./benchmark-fields";
import { modalityWireNames, omniscienceModalityWireNames } from "./model-compact";

const ENRICH_BASE_FIELDS = [
  "id",
  "slug",
  "name",
  "shortName",
  "intelligenceIndex",
  "isReasoning",
  "analystAgent",
  "releaseDate",
  "isOpenWeights",
  "parameters",
  "sizeClass",
  "price1mInputTokens",
  "price1mOutputTokens",
  "cacheHitPrice",
  "cacheWritePrice",
  "creator",
];

export const MODELS_PATH_FIELDS = [
  ...ENRICH_BASE_FIELDS,
  "omniscienceHallucinationRate",
  ...modelsBenchmarkWireNames,
  ...modalityWireNames,
];

export const OMNISCIENCE_PATH_FIELDS = [
  ...ENRICH_BASE_FIELDS,
  "medianCanonicalAnswerOutputSpeed",
  "omniscienceBreakdown",
  ...omniscienceBenchmarkWireNames,
  ...omniscienceModalityWireNames,
];

/** Keeps only the fields one enrichment page serves, preserving upstream spelling for aliased fields. */
export function projectFields(fields: readonly string[]): (m: Record<string, unknown>) => Record<string, unknown> {
  return (m) => {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      const alias = presentAlias(m, field);
      if (alias !== undefined) row[field] = m[alias];
    }
    return row;
  };
}

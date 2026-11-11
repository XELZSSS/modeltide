import { modelsBenchmarkWireNames, omniscienceBenchmarkWireNames } from "./benchmark-fields";
import { copyField, MODALITY_WIRE_NAMES, OMNISCIENCE_MODALITY_WIRE_NAMES, type AaRow } from "../wire";

/**
 * The scalar fields both enrichment pages serve, in the spelling `/models` uses — which is `AaRow`'s spelling, because
 * that page is where the normalized row's names come from.
 *
 * The list is typed `readonly (keyof AaRow)[]`: a field renamed in the wire contract, or a key the normalized row does
 * not have, does not compile here.
 */
const ENRICH_BASE_FIELDS: readonly (keyof AaRow)[] = [
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

export const MODELS_PATH_FIELDS: readonly (keyof AaRow)[] = [
  ...ENRICH_BASE_FIELDS,
  "omniscienceHallucinationRate",
  ...modelsBenchmarkWireNames,
  ...MODALITY_WIRE_NAMES,
];

export const OMNISCIENCE_PATH_FIELDS: readonly (keyof AaRow)[] = [
  ...ENRICH_BASE_FIELDS,
  "outputSpeed",
  "omniscienceBreakdown",
  ...omniscienceBenchmarkWireNames,
  ...OMNISCIENCE_MODALITY_WIRE_NAMES,
];

/** Keeps only the fields one enrichment page serves, preserving upstream spelling for aliased fields. */
export function projectFields(fields: readonly (keyof AaRow)[]): (m: AaRow) => AaRow {
  return (m) => {
    const row: AaRow = {};
    for (const field of fields) copyField(m, row, field);
    return row;
  };
}

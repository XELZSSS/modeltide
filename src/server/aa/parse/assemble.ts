import { byNumberDesc } from "@/server/formats/ordering";
import { isValidModelIdentity } from "@/server/formats/content-guards";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { ModelMetaEntry } from "@/server/formats/wire-types";
import { compact } from "./model-compact";
import { mergeBySlug } from "./model-merge";
import { backfillFromMeta } from "./meta-backfill";

const MAX_RATIO_WARNINGS = 8;

interface AssembleInput {
  indexModels: Record<string, unknown>[];
  modelsEnrich: Record<string, unknown>[];
  omniscienceEnrich: Record<string, unknown>[];
  meta: Record<string, ModelMetaEntry> | null;
}

interface AssembledModels {
  models: ArtificialAnalysisModel[];
  outOfRatio: string[];
  backfilled: number;
}

/**
 * Merges the leaderboard catalog with both enrichment pages, compacts the result onto the public
 * model shape, and backfills missing index fields from OpenRouter directory metadata.
 */
export function assembleModels({ indexModels, modelsEnrich, omniscienceEnrich, meta }: AssembleInput): AssembledModels {
  // Declared-ratio fields that arrive on another scale are dropped by `compact`; surface them instead of losing data
  // silently (the parse is cached, so this logs at most once per refresh).
  const outOfRatio = new Set<string>();
  const warnRatio = (field: string, value: number): void => {
    if (outOfRatio.size < MAX_RATIO_WARNINGS) outOfRatio.add(`${field}=${value}`);
  };
  const merged = mergeBySlug(indexModels, modelsEnrich, omniscienceEnrich)
    .map((row) => compact(row, warnRatio))
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  const backfilled = backfillFromMeta(merged, meta ?? {});
  const models = merged.sort(byNumberDesc((m) => m.intelligence_index));
  return { models, outOfRatio: [...outOfRatio], backfilled };
}

import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS, ttlFor } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { parseRscPayloads, findNextData } from "@/server/parsers/rsc";
import { zeroUpstream } from "@/server/infra/errors";
import { byNumberDesc } from "@/server/parsers/shaping";
import { hasCatalogIdentity, isValidModelIdentity } from "@/server/sources/data-filter";
import { obj, str } from "@/server/parsers/primitives";
import { getModelDirectory } from "@/server/sources/openrouter/directory";
import { compact, compactOmniscienceEnrich } from "@/server/sources/aa/compact";
import { backfillFromMeta } from "@/server/sources/aa/match-meta";
import {
  INDEX_PATH,
  MODELS_PATH,
  OMNISCIENCE_PATH,
  fetchAaRsc,
  fetchAndParseEnrich,
  findModelArray,
} from "@/server/sources/aa/fetch";

export function mergeBySlug(
  catalog: Record<string, unknown>[],
  ...enrich: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const m of catalog) {
    if (!hasCatalogIdentity(m)) continue;
    const slug = str(m.slug);
    if (!merged.has(slug)) merged.set(slug, { ...m });
  }
  for (const models of enrich) {
    for (const m of models) {
      const slug = str(m.slug);
      if (!slug || !merged.has(slug)) continue;
      const cur = merged.get(slug) as Record<string, unknown>;
      const mergedEntry: Record<string, unknown> = { ...cur };
      for (const [key, value] of Object.entries(m)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        if (value !== null && value !== undefined && value !== "") mergedEntry[key] = value;
      }
      if (cur.omniscienceBreakdown && m.omniscienceBreakdown) {
        const patch = Object.fromEntries(
          Object.entries(obj(m.omniscienceBreakdown) ?? {}).filter(
            ([, v]) => v !== null && v !== undefined && v !== "",
          ),
        );
        mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...patch };
      }
      merged.set(slug, mergedEntry);
    }
  }
  return [...merged.values()];
}

export interface IntelligenceIndexResult {
  models: ArtificialAnalysisModel[];
  /** Open-weights flags for the FULL pre-slice index: slug/id → flag. */
  weights: Record<string, boolean>;
  enrichFailed: boolean;
}

/** Weights lookup covering every merged model, built before the serving cap is applied. */
export function buildWeightsRecord(models: ArtificialAnalysisModel[]): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) record[m.slug] = m.is_open_weights;
    if (m.id && m.id !== m.slug) record[m.id] = m.is_open_weights;
  }
  return record;
}

async function fetchIntelligenceIndex(ctx: AppContext): Promise<IntelligenceIndexResult> {
  const [indexBody, [modelsPageModels, omniscienceEnrich], openRouterMeta] = await Promise.all([
    fetchAaRsc(ctx, INDEX_PATH),
    Promise.all([
      fetchAndParseEnrich<Record<string, unknown>>(ctx, "/models", MODELS_PATH, "initialModels", (tree) =>
        findNextData(tree, "initialModels"),
      ),
      fetchAndParseEnrich<Record<string, unknown>>(
        ctx,
        "/omniscience",
        OMNISCIENCE_PATH,
        "initialModels",
        (tree) => {
          const arr = findNextData<Record<string, unknown>>(tree, "initialModels");
          return Array.isArray(arr) && arr.some((m) => m.omniscienceBreakdown != null) ? arr : null;
        },
        (arr) => arr.map(compactOmniscienceEnrich),
      ),
    ]),
    getModelDirectory(ctx)
      .then((d) => d.meta)
      .catch(() => ({}) as Record<string, import("@/server/sources/openrouter/types").ModelMetaEntry>),
  ]);

  const [indexModels, catalog] = parseRscPayloads(indexBody, ["intelligenceIndex", "models"], findModelArray) as [
    Record<string, unknown>[],
    Record<string, unknown>[],
  ];

  const enrichFailures = [modelsPageModels, omniscienceEnrich].filter((a) => a.length === 0).length;
  const [primary, secondary] = indexModels.length > 0 ? [indexModels, catalog] : [catalog, indexModels];
  const merged = mergeBySlug(primary, secondary, modelsPageModels, omniscienceEnrich)
    .map(compact)
    .filter((m) => isValidModelIdentity(m.id, m.slug, m.name));
  // Served in full: detail pages, search and the weights lookup resolve
  // against this list, so truncating it would lose content.
  const weights = buildWeightsRecord(merged);
  const models = merged.sort(byNumberDesc((m) => m.intelligence_index));
  if (models.length === 0) {
    throw zeroUpstream(
      "Artificial Analysis parsing",
      "models",
      `catalog=${catalog.length}, kept=0, enrichFailures=${enrichFailures}`,
    );
  }
  const backfilled = backfillFromMeta(models, openRouterMeta);
  if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
  return { models, weights, enrichFailed: enrichFailures > 0 };
}

export const getIntelligenceIndexResult = (ctx: AppContext): Promise<IntelligenceIndexResult> =>
  ctx.cache.withTtl(cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    const { models, weights, enrichFailed } = await fetchIntelligenceIndex(ctx);
    return { data: { models, weights, enrichFailed }, ttl: ttlFor(enrichFailed) };
  });

export const getIntelligenceIndex = async (
  ctx: AppContext,
): Promise<import("@/server/sources/types").SourcePayload<ArtificialAnalysisModel[]>> => {
  const { models, enrichFailed } = await getIntelligenceIndexResult(ctx);
  return { data: models, fetchedAt: new Date().toISOString(), ...(enrichFailed ? { partial: true } : {}) };
};

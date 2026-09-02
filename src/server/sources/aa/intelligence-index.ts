import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS, cacheKeys, ttlFor } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { parseRscPayloads, findNextData } from "@/server/parsers/rsc";
import { UpstreamError } from "@/server/infra/errors";
import { hasCatalogIdentity, isValidModelIdentity } from "@/server/sources/data-filter";
import { obj, str } from "@/server/parsers/primitives";
import { fetchModelDirectory } from "@/server/sources/openrouter/directory";
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
        if (value !== null && value !== undefined) mergedEntry[key] = value;
      }
      if (cur.omniscienceBreakdown && m.omniscienceBreakdown) {
        mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...obj(m.omniscienceBreakdown) };
      }
      merged.set(slug, mergedEntry);
    }
  }
  return [...merged.values()];
}

let lastEnrichFailures = 0;
export function lastIndexEnrichFailures(): number {
  return lastEnrichFailures;
}

export const getIntelligenceIndex = (ctx: AppContext): Promise<ArtificialAnalysisModel[]> =>
  ctx.cache.withTtl(cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    const [indexBody, [modelsPageModels, omniscienceEnrich], openRouterMeta] = await Promise.all([
      fetchAaRsc(ctx, INDEX_PATH),
      Promise.all([
        fetchAndParseEnrich<Record<string, unknown>>(ctx, "/models", MODELS_PATH, "initialModels", (tree) =>
          findNextData(tree, "initialModels"),
        ),
        fetchAndParseEnrich<Record<string, unknown>>(
          ctx,
          "omniscience",
          OMNISCIENCE_PATH,
          "initialModels",
          (tree) => {
            const arr = findNextData<Record<string, unknown>>(tree, "initialModels");
            return Array.isArray(arr) && arr.some((m) => m.omniscienceBreakdown != null) ? arr : null;
          },
          (arr) => arr.map(compactOmniscienceEnrich),
        ),
      ]),
      fetchModelDirectory(ctx).then((d) => d.meta),
    ]);

    const [indexModels, catalog] = parseRscPayloads(indexBody, ["intelligenceIndex", "models"], findModelArray) as [
      Record<string, unknown>[],
      Record<string, unknown>[],
    ];

    const enrichFailures = [modelsPageModels, omniscienceEnrich].filter((a) => a.length === 0).length;
    lastEnrichFailures = enrichFailures;
    const [primary, secondary] = indexModels.length > 0 ? [indexModels, catalog] : [catalog, indexModels];
    const models = mergeBySlug(primary, secondary, modelsPageModels, omniscienceEnrich)
      .map(compact)
      .filter((m) => isValidModelIdentity(m.id, m.slug, m.name))
      .sort((a, b) => {
        const av = a.intelligence_index ?? Number.NEGATIVE_INFINITY;
        const bv = b.intelligence_index ?? Number.NEGATIVE_INFINITY;
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
        return bv - av;
      });
    if (models.length === 0) {
      throw new UpstreamError(
        `Artificial Analysis parsing yielded 0 models (catalog=${catalog.length}, kept=0, enrichFailures=${enrichFailures})`,
      );
    }
    const backfilled = backfillFromMeta(models, openRouterMeta);
    if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
    return { data: models, ttl: ttlFor(enrichFailures > 0) };
  });

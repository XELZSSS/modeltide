import { upstreamConfig, DEFAULT_TTL_MS, cacheKeys, ttlFor, ONE_MINUTE } from "@/shared/config";
import type { ArtificialAnalysisModel, TextToImageModel, TextToImagePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/utils";
import { getOpenRouterModelMeta } from "@/server/sources/openrouter";
import { backfillFromMeta, compact, compactOmniscienceEnrich } from "./mapping";
import { mergeBySlug } from "./merge";
import { mapEntry, type RawEntry } from "./text-to-image";

// RSC request headers make Next.js serve raw flight payloads instead of rendered HTML.
const RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

const INDEX_PATH = "/evaluations/artificial-analysis-intelligence-index";
const MODELS_PATH = "/models";
const OMNISCIENCE_PATH = "/evaluations/omniscience";

async function fetchAaRsc(ctx: AppContext, path: string): Promise<string> {
  return ctx.http.text(`${upstreamConfig.artificialAnalysis}${path}`, {
    headers: { ...RSC_HEADERS },
    retries: 0,
    // Two serial stages (index fetch, then parallel enrichment fetches) must fit
    // inside the 60s route timeout, so a single fetch is capped at 15s.
    timeoutMs: 15 * ONE_MINUTE / 60, // 15s timeout
  });
}

/** A plausible model catalog: a large array of model-shaped rows (slug per row). */
function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return Array.isArray(arr) && arr.length >= 20 && arr.some((m) => m && typeof m === "object" && "slug" in m);
}

/**
 * Prefer the array whose rows carry intelligenceIndex (the true catalog), regardless
 * of key name; fall back to any large model-shaped array.
 */
function findModelArray(tree: unknown): Record<string, unknown>[] | null {
  const candidates = [
    findNextData<Record<string, unknown>>(tree, "initialModels"),
    findNextData<Record<string, unknown>>(tree, "models"),
  ];
  for (const arr of candidates) {
    if (arr?.some((m) => m && typeof m === "object" && "intelligenceIndex" in m)) return arr;
  }
  for (const arr of candidates) {
    if (isModelArray(arr)) return arr;
  }
  return null;
}

async function fetchAndParseEnrich<T>(
  ctx: AppContext,
  label: string,
  path: string,
  marker: string,
  extract: (tree: unknown) => T[] | null,
  map?: (arr: T[]) => T[],
): Promise<T[]> {
  let body: string | null;
  try {
    body = await fetchAaRsc(ctx, path);
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment failed: ${errMsg(err)}`);
    return [];
  }
  try {
    const arr = parseRscPayload<T>(body, marker, extract);
    return map ? map(arr) : arr;
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment parse failed: ${errMsg(err)}`);
    return [];
  }
}

export const getIntelligenceIndex = (ctx: AppContext): Promise<ArtificialAnalysisModel[]> =>
  ctx.cache.withTtl(cacheKeys.intelligenceIndex, DEFAULT_TTL_MS, async () => {
    // Fetch all independent RSC payloads in parallel; longest path is max(fetch) not sum.
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
      getOpenRouterModelMeta(ctx),
    ]);

    const indexModels = parseRscPayload<Record<string, unknown>>(indexBody, "intelligenceIndex", findModelArray);
    const catalog = parseRscPayload<Record<string, unknown>>(indexBody, "models", findModelArray);

    const enrichFailures = [modelsPageModels, omniscienceEnrich].filter((a) => a.length === 0).length;
    // Use the intelligence-bearing array as primary (30 full), fall back to the catalog.
    const [primary, secondary] = indexModels.length > 0 ? [indexModels, catalog] : [catalog, indexModels];
    const models = mergeBySlug(primary, secondary, modelsPageModels, omniscienceEnrich)
      .map(compact)
      .filter((m) => m.slug && m.name)
      .sort((a, b) => (b.intelligence_index ?? -Infinity) - (a.intelligence_index ?? -Infinity));
    if (models.length === 0) {
      throw new UpstreamError(
        `Artificial Analysis parsing yielded 0 models (catalog=${catalog.length}, enrichFailures=${enrichFailures})`,
      );
    }
    // Fill gaps (context window, agentic index, blended price) using the OpenRouter
    // directory meta plus the model's own AA pricing; AA first-party values always win.
    const backfilled = backfillFromMeta(models, openRouterMeta);
    if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
    // Refresh sooner when any enrichment failed so partial data is retried quickly.
    return { data: models, ttl: ttlFor(enrichFailures > 0) };
  });

const TEXT_TO_IMAGE_PATH = "/image/models";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<TextToImagePayload> =>
  ctx.cache.withTtl(cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string | null = null;
    try {
      body = await fetchAaRsc(ctx, TEXT_TO_IMAGE_PATH);
    } catch {
      ctx.log("warn", "[text-to-image] fetch failed, returning empty");
      return { data: { models: [] }, ttl: 60_000 };
    }
    if (!body) {
      ctx.log("warn", "[text-to-image] empty body, returning empty");
      return { data: { models: [] }, ttl: 60_000 };
    }
    let rawModels: Record<string, unknown>[] | null = null;
    try {
      rawModels = parseRscPayload<Record<string, unknown>>(body, "textToImage", (tree) => findNextData(tree, "textToImage"));
    } catch {
      rawModels = null;
    }
    if (!rawModels || rawModels.length === 0) {
      ctx.log("warn", "[text-to-image] no marker found, returning empty");
      return { data: { models: [] }, ttl: 60_000 };
    }
    const mapped = rawModels.map((m) => mapEntry(m as RawEntry)).filter((m): m is TextToImageModel => m !== null);
    const deduped = new Map<string, TextToImageModel>();
    for (const m of mapped) {
      const prev = deduped.get(m.slug);
      if (!prev || (m.elo != null && (prev.elo == null || m.elo > prev.elo))) deduped.set(m.slug, m);
    }
    const models = [...deduped.values()].sort((a, b) => a.rank - b.rank);
    if (models.length === 0) {
      ctx.log("warn", `[text-to-image] mapped 0 models from raw=${rawModels.length}, returning empty`);
      return { data: { models: [] }, ttl: 60_000 };
    }
    return { data: { models } };
  });

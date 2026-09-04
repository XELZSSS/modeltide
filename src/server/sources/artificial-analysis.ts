import {
  upstreamConfig,
  DEFAULT_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  cacheKeys,
  ttlFor,
  UPSTREAM_TIMEOUT_MS,
} from "@/shared/config";
import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel, TextToImageModel, TextToImagePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { UpstreamError, errMsg } from "@/server/infra";
import { getOpenRouterModelMeta, type ModelMetaEntry } from "@/server/sources/openrouter";
import { dedupeBy, isFiniteNumber, normalizeModelKey, normalizePercent, toStringOrNull } from "@/shared/utils";
import {
  bool,
  isoDate,
  num,
  numNonNegative,
  numPositive,
  obj,
  str,
  strOr,
  titleCase,
} from "@/server/parsers/primitives";

// ---- catalog mapping (pure): compact rows, blend price, meta backfill ----
/** Upstream field names that differ from the benchmark key; all other keys map 1:1. */
const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalbenchV21",
  apex_agents: "apexAgents",
};

export function compactBenchmarks(m: Record<string, unknown>): Record<string, number | null> {
  const benchmarks: Record<string, number | null> = {};
  for (const key of BENCHMARK_KEYS) benchmarks[key] = num(m[BENCHMARK_FIELD_OVERRIDES[key] ?? key]);
  return benchmarks;
}

const MODALITIES = ["text", "image", "speech", "video"] as const;

export function normalizeToPercent(v: number | null): number | null {
  if (v == null) return null;
  if (v > 1 && v <= 100) return v;
  if (v >= 0 && v <= 1) return v * 100;
  return normalizePercent(v);
}

function compactCodingIndex(m: Record<string, unknown>): number | null {
  const tb = normalizeToPercent(num(m.terminalbenchV21));
  const sc = normalizeToPercent(num(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Project one raw upstream model record onto the public ArtificialAnalysisModel shape. */
export function compact(m: Record<string, unknown>): ArtificialAnalysisModel {
  const creator = obj(m.creator);
  const agentic = num(m.analystAgent);
  const omniscience = num(m.omniscience);
  const omniscienceBreakdown = obj(m.omniscienceBreakdown);
  const cost = obj(m.intelligenceIndexCost);
  const timescale = obj(m.timescaleData);
  const rawRelease = strOr(m.releaseDate);
  const releaseDate = isoDate(rawRelease) ?? undefined;

  const model: ArtificialAnalysisModel = {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    short_name: strOr(m.shortName),
    model_creators: creator ? { name: str(creator.name), color: str(creator.color) } : undefined,
    intelligence_index: num(m.intelligenceIndex),
    is_reasoning: bool(m.isReasoning),
    coding_index: compactCodingIndex(m),
    agentic_index: normalizeToPercent(agentic),
    release_date: releaseDate,
    is_open_weights: bool(m.isOpenWeights),
    context_window_tokens: numPositive(m.contextWindowTokens),
    blended_price: numNonNegative(m.price1mBlended7To2To1),
    cost: cost
      ? {
          total: num(cost.total),
          input: num(cost.input),
          output: num(cost.output),
          reasoning: num(cost.reasoning),
        }
      : undefined,
    benchmarks: compactBenchmarks(m),
    pricing: {
      input: numNonNegative(m.price1mInputTokens),
      output: numNonNegative(m.price1mOutputTokens),
      cache_hit: numNonNegative(m.cacheHitPrice),
    },
    speed: {
      median_output_speed: num(timescale?.medianOutputSpeed) ?? num(m.medianCanonicalAnswerOutputSpeed),
    },
    omniscience_breakdown:
      omniscienceBreakdown != null || omniscience != null
        ? {
            total: {
              accuracy: normalizeToPercent(num(omniscienceBreakdown?.accuracy)),
              attempt_rate: normalizeToPercent(num(omniscienceBreakdown?.attemptRate)),
              hallucination_rate: normalizeToPercent(num(omniscienceBreakdown?.hallucinationRate)),
              omniscience: normalizeToPercent(omniscience),
            },
          }
        : undefined,
  };
  for (const mo of MODALITIES) {
    const suffix = titleCase(mo);
    model[`input_modality_${mo}`] = bool(m[`inputModality${suffix}`]);
    model[`output_modality_${mo}`] = bool(m[`outputModality${suffix}`]);
  }
  return model;
}

/** Partial fields merged into the catalog from the omniscience page. */
export function compactOmniscienceEnrich(m: Record<string, unknown>): Record<string, unknown> {
  const breakdown = obj(m.omniscienceBreakdown);
  return {
    slug: str(m.slug),
    omniscience: num(m.omniscience),
    omniscienceBreakdown:
      breakdown != null
        ? {
            accuracy: num(breakdown.accuracy),
            attemptRate: num(breakdown.attemptRate),
            hallucinationRate: num(breakdown.hallucinationRate),
          }
        : undefined,
  };
}

/**
 * Artificial Analysis "blended price": a 7:2:1 weighted mix of the cached-input / input /
 * output prices in $/1M tokens. The cached-input price falls back to the input price when
 * the model has no cache tier (matching upstream's behavior).
 */
export function computeBlendPrice(
  p?: { input?: number | null; output?: number | null; cache_hit?: number | null } | null,
): number | null {
  if (!p) return null;
  const { input, output } = p;
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  if (typeof output !== "number" || !Number.isFinite(output)) return null;
  const cache = typeof p.cache_hit === "number" && Number.isFinite(p.cache_hit) ? p.cache_hit : input;
  return (7 * cache + 2 * input + output) / 10;
}

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  for (const raw of [m.name, m.short_name, m.slug]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    const entry = key ? meta[key] : undefined;
    if (entry && (entry.contextLength != null || entry.agenticIndex != null || entry.pricing != null)) return entry;
  }
  return undefined;
}

/**
 * Fill missing context window / agentic index / blended-price values from an OpenRouter
 * directory meta map (loose-normalized model keys). Only null values are filled — first-party
 * AA data (including its own pricing for the blend) always wins — and the number of filled
 * fields is returned for logging.
 */
export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    if (m.context_window_tokens != null && m.agentic_index != null && m.blended_price != null) continue;
    const entry = matchMeta(m, meta);
    if (entry) {
      if (m.context_window_tokens == null && entry.contextLength != null) {
        m.context_window_tokens = entry.contextLength;
        filled++;
      }
      if (m.agentic_index == null && entry.agenticIndex != null) {
        m.agentic_index = normalizeToPercent(entry.agenticIndex);
        filled++;
      }
    }
    // Blended price: prefer the model's own AA pricing; fall back to the OpenRouter
    // directory pricing (already converted to $/1M) using the same 7:2:1 formula.
    // Independent of an OpenRouter meta match so AA-priced models are always covered.
    if (m.blended_price == null) {
      const fromMeta = entry?.pricing
        ? { input: entry.pricing.input, output: entry.pricing.output, cache_hit: entry.pricing.cacheHit }
        : undefined;
      const blend = computeBlendPrice(m.pricing ?? undefined) ?? computeBlendPrice(fromMeta);
      if (blend != null) {
        m.blended_price = blend;
        filled++;
      }
    }
  }
  return filled;
}

// ---- rankings source (fetch + cache) ----
/**
 * Merge the base catalog with enrichment lists by slug; first occurrence wins for
 * the catalog, later enrichments overlay their fields onto existing entries.
 * Enrichment entries whose slug is absent from the catalog are skipped so they
 * never surface as ghost models. Deep-merges nested breakdown objects.
 */
export function mergeBySlug(
  catalog: Record<string, unknown>[],
  ...enrich: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const m of catalog) {
    const slug = str(m.slug);
    if (!slug || !str(m.name)) continue;
    if (!merged.has(slug)) merged.set(slug, { ...m });
  }
  for (const models of enrich) {
    for (const m of models) {
      const slug = str(m.slug);
      if (!slug || !merged.has(slug)) continue;
      const cur = merged.get(slug) as Record<string, unknown>;
      // Overlay only meaningful values: enrichment entries carry explicit nulls for
      // missing fields, which must not clobber values the catalog already has.
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

const intOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
};

interface RawElo {
  elo?: unknown;
  ciDelta?: unknown;
  appearances?: unknown;
  wins?: unknown;
  winRate?: unknown;
  tag?: unknown;
}

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  pricePer1kImages?: unknown;
  overallElo?: unknown;
  overallRank?: unknown;
  elos?: unknown;
  creator?: unknown;
}

export function mapEntry(raw: RawEntry): TextToImageModel | null {
  const id = toStringOrNull(raw.id);
  const slug = toStringOrNull(raw.slug);
  const name = toStringOrNull(raw.name);
  if (!id || !slug || !name) return null;

  const rank = isFiniteNumber(raw.overallRank) && raw.overallRank > 0 ? Math.trunc(raw.overallRank) : null;
  if (rank == null) return null;

  const elos = Array.isArray(raw.elos) ? (raw.elos as RawElo[]) : [];
  const overallEloEntry =
    elos.find((e) => e != null && typeof e === "object" && (e as Record<string, unknown>).tag == null) ??
    elos.find((e) => e != null && typeof e === "object") ??
    null;

  let elo: number | null = null;
  let ciDelta: number | null = null;
  let appearances: number | null = null;
  let winRate: number | null = null;

  if (overallEloEntry) {
    elo = num(overallEloEntry.elo);
    ciDelta = num(overallEloEntry.ciDelta);
    appearances = intOrNull(overallEloEntry.appearances);
    winRate = num(overallEloEntry.winRate);
  }

  if (elo == null && isFiniteNumber(raw.overallElo)) elo = raw.overallElo as number;
  if (elo == null) return null;

  const pricePer1kImages = numNonNegative(raw.pricePer1kImages);
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id,
    slug,
    name: name.trim(),
    rank,
    elo,
    eloLower: ciDelta != null ? elo - ciDelta : null,
    eloUpper: ciDelta != null ? elo + ciDelta : null,
    appearances,
    winRate,
    pricePer1kImages,
    creatorName: creator ? toStringOrNull(creator.name) : null,
  };
}

// RSC request headers make Next.js serve raw flight payloads instead of rendered HTML.
const RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

const INDEX_PATH = "/evaluations/artificial-analysis-intelligence-index";
export { INDEX_PATH };
const MODELS_PATH = "/models";
const OMNISCIENCE_PATH = "/evaluations/omniscience";

async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return ctx.http.text(`${upstreamConfig.artificialAnalysis}${path}`, {
    headers: { ...RSC_HEADERS },
    retries,
    // All fetches fan out in one Promise.all inside the 25s route timeout, so a
    // single fetch is capped at UPSTREAM_TIMEOUT_MS (10s; worst case with 1 retry
    // ≈ 21s). Enrichments pass retries 0 — they degrade to [] on failure anyway,
    // so they must never become the long pole that 504s the whole route.
    timeoutMs: UPSTREAM_TIMEOUT_MS,
  });
}

/** A plausible model catalog: an array of model-shaped rows (slug per row). */
function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.some((m) => m && typeof m === "object" && "slug" in m && typeof (m as { slug?: unknown }).slug === "string")
  );
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
    body = await fetchAaRsc(ctx, path, 0);
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
    // Debug-level: this fires on nearly every tick, keep info logs for real anomalies.
    if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
    // Refresh sooner when any enrichment failed so partial data is retried quickly.
    return { data: models, ttl: ttlFor(enrichFailures > 0) };
  });

const TEXT_TO_IMAGE_PATH = "/image/models";

function emptyT2i(ctx: AppContext, reason: string): { data: TextToImagePayload; ttl: number } {
  ctx.log("warn", `[text-to-image] ${reason}, returning empty`);
  return { data: { models: [], partial: true, fetchedAt: new Date().toISOString() }, ttl: PARTIAL_FAIL_TTL_MS };
}

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<TextToImagePayload> =>
  ctx.cache.withTtl(cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string | null = null;
    try {
      body = await fetchAaRsc(ctx, TEXT_TO_IMAGE_PATH);
    } catch (err) {
      return emptyT2i(ctx, `fetch failed: ${errMsg(err)}`);
    }
    if (!body) {
      return emptyT2i(ctx, "empty body");
    }
    let rawModels: Record<string, unknown>[] | null = null;
    try {
      rawModels = parseRscPayload<Record<string, unknown>>(body, "textToImage", (tree) =>
        findNextData(tree, "textToImage"),
      );
    } catch {
      rawModels = null;
    }
    if (!rawModels || rawModels.length === 0) {
      return emptyT2i(ctx, `no marker found (body=${body.length}B)`);
    }
    const mapped = rawModels.map((m) => mapEntry(m as RawEntry)).filter((m): m is TextToImageModel => m !== null);
    // Keep the highest-elo duplicate: dedupeBy keeps first, so pre-sort by elo desc.
    const models = dedupeBy(
      [...mapped].sort((a, b) => (b.elo ?? -Infinity) - (a.elo ?? -Infinity)),
      (m) => m.slug,
    ).sort((a, b) => a.rank - b.rank);
    if (models.length === 0) {
      return emptyT2i(ctx, `mapped 0 models from raw=${rawModels.length}`);
    }
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });

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
import {
  computeBlendPrice,
  dedupeBy,
  isFiniteNumber,
  normalizeModelKey,
  normalizePercent,
  toStringOrNull,
} from "@/shared/utils";
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
import {
  hasCatalogIdentity,
  isNonEmptyString,
  isValidModelIdentity,
  isValidTextToImageEntry,
} from "@/server/sources/data-filter";

// Upstream field names that differ from the benchmark key; the rest map 1:1.
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

function compactCodingIndex(m: Record<string, unknown>): number | null {
  const tb = normalizePercent(num(m.terminalbenchV21));
  const sc = normalizePercent(num(m.scicode));
  if (tb == null && sc == null) return null;
  const values = [tb, sc].filter((v): v is number => v != null);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Project one raw upstream record onto the public shape. */
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
    agentic_index: normalizePercent(agentic),
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
              accuracy: normalizePercent(num(omniscienceBreakdown?.accuracy)),
              attempt_rate: normalizePercent(num(omniscienceBreakdown?.attemptRate)),
              hallucination_rate: normalizePercent(num(omniscienceBreakdown?.hallucinationRate)),
              omniscience: normalizePercent(omniscience),
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

/** Partial fields merged from the omniscience page. */
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

/** OpenRouter directory match by loose key; needs at least one usable field. */
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
 * Fill null context window / agentic index / blended price from the OpenRouter
 * directory. AA first-party values always win. Returns the filled field count.
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
        m.agentic_index = normalizePercent(entry.agenticIndex);
        filled++;
      }
    }
    // Blended price prefers AA pricing; falls back to OpenRouter directory pricing.
    // Independent of a meta match so AA-priced models are always covered.
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

// Rankings source (fetch + cache).
/**
 * Merge the catalog with enrichment lists by slug. Enrichments overlay onto
 * existing entries only — unknown slugs are skipped (no ghost models).
 */
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
      // Enrichment nulls must not clobber catalog values.
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

  const rank = isFiniteNumber(raw.overallRank) && raw.overallRank > 0 ? Math.trunc(raw.overallRank) : null;

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
  // Unified dirty/invalid/unsuitable gate (identity + rank + elo).
  if (!isValidTextToImageEntry({ id, slug, name, rank, elo })) return null;
  const validId = id as string;
  const validSlug = slug as string;
  const validName = name as string;
  const validRank = rank as number;
  const validElo = elo as number;

  const pricePer1kImages = numNonNegative(raw.pricePer1kImages);
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id: validId,
    slug: validSlug,
    name: validName.trim(),
    rank: validRank,
    elo: validElo,
    eloLower: ciDelta != null ? validElo - ciDelta : null,
    eloUpper: ciDelta != null ? validElo + ciDelta : null,
    appearances,
    winRate,
    pricePer1kImages,
    creatorName: creator ? toStringOrNull(creator.name) : null,
  };
}

// RSC headers make Next.js serve raw flight payloads instead of HTML.
const RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

const INDEX_PATH = "/evaluations/artificial-analysis-intelligence-index";
export { INDEX_PATH };
const MODELS_PATH = "/models";
const OMNISCIENCE_PATH = "/evaluations/omniscience";

async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return ctx.http.text(`${upstreamConfig.artificialAnalysis}${path}`, {
    headers: { ...RSC_HEADERS },
    retries,
    // Enrichments degrade to [] on failure, so they pass retries 0 and must
    // never become the long pole that 504s the whole route.
    timeoutMs: UPSTREAM_TIMEOUT_MS,
  });
}

/** A plausible model catalog: rows carrying a usable slug. */
function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.some((m) => m && typeof m === "object" && isNonEmptyString((m as { slug?: unknown }).slug))
  );
}

/** Prefer the array carrying intelligenceIndex (the true catalog). */
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
        `Artificial Analysis parsing yielded 0 models (catalog=${catalog.length}, enrichFailures=${enrichFailures})`,
      );
    }
    // Fill gaps (context window, agentic index, blended price) using the OpenRouter
    // directory meta plus the model's own AA pricing; AA first-party values always win.
    const backfilled = backfillFromMeta(models, openRouterMeta);
    if (backfilled > 0) ctx.log("info", `[artificial] backfilled ${backfilled} missing field(s)`);
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
    // dedupeBy keeps the first, so pre-sort by elo desc to keep the best duplicate.
    const models = dedupeBy(
      [...mapped].sort((a, b) => (b.elo ?? -Infinity) - (a.elo ?? -Infinity)),
      (m) => m.slug,
    ).sort((a, b) => a.rank - b.rank);
    if (models.length === 0) {
      return emptyT2i(ctx, `mapped 0 models from raw=${rawModels.length}`);
    }
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });

// Changelog: full model history (the intelligence index only carries the
// current leaderboard). The page is server-rendered HTML embedding Next.js
// flight payloads; the `models` array holds one entry per model variant with
// its release family, date and creator — but no open-weights flag (callers
// join weights from the index or fall back to curated creator rules).
export const CHANGELOG_PATH = "/changelog";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

/** Scan flight-escaped HTML for `"models":[...]` arrays; returns each parsed array. */
function extractModelsArrays(html: string): unknown[] {
  // Payloads sit inside JS strings, so quotes arrive backslash-escaped.
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const found: unknown[] = [];
  const needle = '"models":[';
  let from = 0;
  while (true) {
    const k = unescaped.indexOf(needle, from);
    if (k === -1) break;
    const d = k + needle.length - 1; // at '['
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = d; i < unescaped.length; i++) {
      // Bound the scan so a markup change can't spin the Worker.
      if (i - d > 8_000_000) break;
      const c = unescaped[i]!;
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') {
        inStr = true;
      } else if (c === "[") {
        depth++;
      } else if (c === "]") {
        depth--;
        if (depth === 0) {
          try {
            found.push(JSON.parse(unescaped.slice(d, i + 1)));
          } catch {
            // Truncated payload — ignore this candidate.
          }
          break;
        }
      }
    }
    from = k + 1;
  }
  return found;
}

function isChangelogRaw(e: unknown): e is Record<string, unknown> {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const r = e as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecordLike(r.release) || !isRecordLike(r.creator)) return false;
  return true;
}

function isRecordLike(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toChangelogModel(e: Record<string, unknown>): ChangelogModel | null {
  const release = e.release as Record<string, unknown>;
  const creator = e.creator as Record<string, unknown>;
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

/** Parse the changelog `models` array (largest shape-valid candidate wins); pure. */
export function parseChangelogModels(html: string): ChangelogModel[] {
  let best: ChangelogModel[] = [];
  for (const v of extractModelsArrays(html)) {
    if (!Array.isArray(v)) continue;
    const mapped = (v as unknown[]).filter(isChangelogRaw).map(toChangelogModel).filter((m): m is ChangelogModel => m !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}

/** Full AA model history for release feeds; throws when the markup yields nothing. */
export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const html = await ctx.http.text(`${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`, {
    headers: { accept: "text/html,application/xhtml+xml,*/*" },
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    retries: 1,
  });
  const models = parseChangelogModels(html);
  if (models.length === 0) {
    throw new UpstreamError(`AA changelog yielded 0 models (markup changed?, body=${html.length}B)`);
  }
  return models;
}

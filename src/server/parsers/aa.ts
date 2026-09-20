import {
  bool,
  isoDate,
  isRecord,
  num,
  numNonNegative,
  numPositive,
  obj,
  str,
  strOr,
  strOrNull,
  titleCase,
  hasCatalogIdentity,
  isNonEmptyString,
  isUnsuitableContent,
  isValidTextToImageEntry,
} from "@/server/parsers/primitives";
import { BENCHMARK_KEYS, type BenchmarkKey } from "@/shared/config";
import type {
  ArtificialAnalysisModel,
  ModelOmniscienceBreakdown,
  ModelPricing,
  TextToImageModel,
} from "@/shared/types";
import { normalizeModelKey, normalizePercent } from "@/shared/utils";
import { findNextData } from "@/server/parsers/rsc";
import { extractNeedleJsonArrays, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scan";
import type { ChangelogRawEntry, RawEntry } from "@/server/parsers/upstream";
import type { ModelMetaEntry } from "@/server/parsers/openrouter";

const BENCHMARK_FIELD_OVERRIDES: Partial<Record<BenchmarkKey, string>> = {
  mmlu_pro: "mmluPro",
  tau_banking: "tauBanking",
  terminalbench_v2_1: "terminalbenchV21",
  terminalbench_v4_0: "terminalbenchV40",
  apex_agents: "apexAgents",
  mmmu_pro: "mmmuPro",
  automation_bench: "automationBenchPartialScore",
};

function compactBenchmarks(m: Record<string, unknown>): Partial<Record<BenchmarkKey, number | null>> {
  const benchmarks: Partial<Record<BenchmarkKey, number | null>> = {};
  for (const key of BENCHMARK_KEYS) {
    const value = num(m[BENCHMARK_FIELD_OVERRIDES[key] ?? key]);
    if (value != null) benchmarks[key] = value;
  }
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

function compactPricing(m: Record<string, unknown>): ModelPricing | undefined {
  const pricing: ModelPricing = {};
  const input = numNonNegative(m.price1mInputTokens);
  const output = numNonNegative(m.price1mOutputTokens);
  const cacheHit = numNonNegative(m.cacheHitPrice);
  const cacheWrite = numNonNegative(m.cacheWritePrice);
  if (input != null) pricing.input = input;
  if (output != null) pricing.output = output;
  if (cacheHit != null) pricing.cacheHit = cacheHit;
  if (cacheWrite != null) pricing.cacheWrite = cacheWrite;
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function defaultMonthlyCost(pricing: ModelPricing | undefined): number | null {
  if (!pricing || typeof pricing.input !== "number" || typeof pricing.output !== "number") return null;
  const hitRate = 0.5;
  const hasWrite = typeof pricing.cacheWrite === "number";
  const writeRate = hasWrite ? Math.min(0.05, 1 - hitRate) : 0;
  const freshRate = 1 - hitRate - writeRate;
  const cached = typeof pricing.cacheHit === "number" ? pricing.cacheHit : pricing.input;
  const writeLeg = hasWrite ? writeRate * pricing.cacheWrite! : 0;
  const inputRate = hitRate * cached + writeLeg + freshRate * pricing.input;
  const daily = 2 * inputRate + 3 * pricing.output;
  const monthly = daily * 22;
  return Number.isFinite(monthly) ? Math.round(monthly * 100) / 100 : null;
}

function compactOmniscience(
  omniscienceBreakdown: Record<string, unknown> | undefined,
  omniscience: number | null,
): ModelOmniscienceBreakdown | undefined {
  if (omniscienceBreakdown == null && omniscience == null) return undefined;
  const total: NonNullable<ModelOmniscienceBreakdown["total"]> = {};
  const accuracy = normalizePercent(num(omniscienceBreakdown?.accuracy));
  const attemptRate = normalizePercent(num(omniscienceBreakdown?.attemptRate));
  const hallucinationRate = normalizePercent(num(omniscienceBreakdown?.hallucinationRate));
  const omni = normalizePercent(omniscience);
  if (accuracy != null) total.accuracy = accuracy;
  if (attemptRate != null) total.attempt_rate = attemptRate;
  if (hallucinationRate != null) total.hallucination_rate = hallucinationRate;
  if (omni != null) total.omniscience = omni;
  return { total };
}

function assignModalities(model: ArtificialAnalysisModel, m: Record<string, unknown>): void {
  for (const mo of MODALITIES) {
    const suffix = titleCase(mo);
    const inputMo = bool(m[`inputModality${suffix}`]);
    if (inputMo !== undefined) model[`input_modality_${mo}`] = inputMo;
    const outputMo = bool(m[`outputModality${suffix}`]);
    if (outputMo !== undefined) model[`output_modality_${mo}`] = outputMo;
  }
}

export function compact(m: Record<string, unknown>): ArtificialAnalysisModel {
  const creator = obj(m.creator);
  const omniscienceBreakdown = obj(m.omniscienceBreakdown);

  const creatorName = creator ? str(creator.name).trim() : "";
  const creatorColor = creator ? str(creator.color).trim() : "";
  const model: ArtificialAnalysisModel = {
    id: str(m.id) || str(m.slug),
    slug: str(m.slug),
    name: str(m.name),
    intelligence_index: num(m.intelligenceIndex),
  };

  const shortName = strOr(m.shortName);
  if (shortName != null) model.short_name = shortName;
  if (creatorName) model.model_creators = { name: creatorName, color: creatorColor };
  const isReasoning = bool(m.isReasoning);
  if (isReasoning !== undefined) model.is_reasoning = isReasoning;
  const coding = compactCodingIndex(m);
  if (coding != null) model.coding_index = coding;
  const agenticPct = normalizePercent(num(m.analystAgent));
  if (agenticPct != null) model.agentic_index = agenticPct;
  const releaseDate = isoDate(strOr(m.releaseDate));
  if (releaseDate != null) model.release_date = releaseDate;
  const isOpenWeights = bool(m.isOpenWeights);
  if (isOpenWeights !== undefined) model.is_open_weights = isOpenWeights;
  const parameters = numPositive(m.parameters);
  if (parameters != null) model.parameters = parameters;
  const sizeClass = strOr(m.sizeClass);
  if (sizeClass != null) model.size_class = sizeClass;

  model.benchmarks = compactBenchmarks(m);
  const pricing = compactPricing(m);
  if (pricing) {
    model.pricing = pricing;
    const defCost = defaultMonthlyCost(pricing);
    if (defCost != null) model.defaultMonthlyCost = defCost;
  }
  const speed = num(m.medianCanonicalAnswerOutputSpeed);
  if (speed != null) model.speed = { median_output_speed: speed };
  const breakdown = compactOmniscience(omniscienceBreakdown, num(m.omniscience));
  if (breakdown) model.omniscience_breakdown = breakdown;
  assignModalities(model, m);
  return model;
}

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

export function findModelArray(tree: unknown): Record<string, unknown>[] | null {
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

function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.some((m) => m && typeof m === "object" && isNonEmptyString((m as { slug?: unknown }).slug))
  );
}

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
  weights: Record<string, boolean>;
  enrichFailed: boolean;
}

export function buildWeightsRecord(models: ArtificialAnalysisModel[]): Record<string, boolean> {
  const record: Record<string, boolean> = Object.create(null);
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) record[m.slug] = m.is_open_weights;
    if (m.id && m.id !== m.slug) record[m.id] = m.is_open_weights;
  }
  return record;
}

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
  let looseHit: ModelMetaEntry | undefined;
  for (const key of keys) {
    const e = Object.hasOwn(meta, key) ? meta[key] : undefined;
    if (!e) continue;
    if (e.intelligenceIndex != null || e.agenticIndex != null) return e;
    looseHit ??= e;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(/\d{4,8}$/, "");
    if (stripped && stripped !== key) {
      const e = Object.hasOwn(meta, stripped) ? meta[stripped] : undefined;
      if (e) return e;
    }
  }
  return undefined;
}

export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    if (m.intelligence_index != null && m.agentic_index != null) continue;
    const entry = matchMeta(m, meta);
    if (entry) {
      if (m.intelligence_index == null && entry.intelligenceIndex != null) {
        m.intelligence_index = entry.intelligenceIndex;
        filled++;
      }
      if (m.agentic_index == null && entry.agenticIndex != null) {
        m.agentic_index = normalizePercent(entry.agenticIndex);
        filled++;
      }
    }
  }
  return filled;
}

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const MODELS_KEY = '"models"';
const CANDIDATE_PREFIX_CHARS = 256;
const SMALL_SUFFIX_CHARS = 256 * 1024 + CANDIDATE_PREFIX_CHARS;
const CANDIDATE_SUFFIX_CHARS = MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS;

function extractModelsArrays(html: string): unknown[] {
  return extractNeedleJsonArrays(html, MODELS_KEY, {
    prefixChars: CANDIDATE_PREFIX_CHARS,
    smallSuffixChars: SMALL_SUFFIX_CHARS,
    maxSuffixChars: CANDIDATE_SUFFIX_CHARS,
    unescape: true,
  });
}

function isChangelogRaw(e: unknown): e is ChangelogRawEntry {
  if (!isRecord(e)) return false;
  const r = e as ChangelogRawEntry;
  if (Array.isArray(r.slug) || Array.isArray(r.name) || Array.isArray(r.releaseDate)) return false;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecord(r.release) || !isRecord(r.creator)) return false;
  return true;
}

const CHANGELOG_FIELD_MAX = 500;

function toChangelogModel(e: ChangelogRawEntry): ChangelogModel | null {
  const release = isRecord(e.release) ? e.release : {};
  const creator = isRecord(e.creator) ? e.creator : {};
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  for (const field of [slug, name, releaseSlug, releaseName, creatorName]) {
    if (field.length > CHANGELOG_FIELD_MAX || isUnsuitableContent(field)) return null;
  }
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

export function parseChangelogModels(html: string): ChangelogModel[] {
  let best: ChangelogModel[] = [];
  for (const v of extractModelsArrays(html)) {
    if (!Array.isArray(v)) continue;
    const mapped = (v as unknown[])
      .filter(isChangelogRaw)
      .map(toChangelogModel)
      .filter((m): m is ChangelogModel => m !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}

export function mapEntry(raw: RawEntry): Omit<TextToImageModel, "rank"> | null {
  const id = strOrNull(raw.id);
  const slug = strOrNull(raw.slug);
  const name = strOrNull(raw.name);
  const elo = num(raw.elo);
  if (!isValidTextToImageEntry({ id, slug, name, elo })) return null;
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id: id as string,
    slug: slug as string,
    name: (name as string).trim(),
    elo: elo as number,
    eloLower: num(raw.lower95ci),
    eloUpper: num(raw.upper95ci),
    pricePer1kImages: numNonNegative(raw.price),
    creatorName: creator ? strOrNull(creator.name) : null,
  };
}

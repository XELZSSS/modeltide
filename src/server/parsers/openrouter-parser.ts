import {
  isRecord,
  isValidRowId,
  numCoerce,
  numCoerceNonNegative,
  numOr,
  obj,
  parseTs,
  str,
  titleCase,
  isValidOpenRouterDirectoryRow,
} from "@/server/parsers/parser-primitives";
import { MAX_DIRECTORY_ROWS, PER_MILLION, SOURCE_LIMITS, perMillionOrNull } from "@/server/config/limits";
import type { OpenRouterRankEntry } from "@/shared/types";

import { normalizeModelKey, toStringOrNull } from "@/shared/utils";

import type { ModelMetaEntry, ModelRow, PricingRow } from "@/server/parsers/upstream-types";

export interface PricingEntry {
  input: number;
  output: number;
  cacheHit: number | null;
  cacheWrite: number | null;
}

type PricingRecord = Record<string, PricingEntry>;

export interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, ModelMetaEntry>;
}

function buildPricingEntry(
  input: number | null,
  output: number | null,
  cacheHit: number | null,
  cacheWrite: number | null,
): PricingEntry | null {
  if (input == null || output == null) return null;
  return {
    input: input * PER_MILLION,
    output: output * PER_MILLION,
    cacheHit: perMillionOrNull(cacheHit),
    cacheWrite: perMillionOrNull(cacheWrite),
  };
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
  };
}

export function parseDirectoryRows(rows: unknown): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  if (!Array.isArray(rows)) return { pricing: pricingRecord, meta: metaRecord };
  const count = Math.min(rows.length, MAX_DIRECTORY_ROWS);
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isValidOpenRouterDirectoryRow(raw)) continue;
    const m = raw as unknown as PricingRow;
    const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
    const pricingEntry = buildPricingEntry(
      numCoerceNonNegative(pricing.prompt),
      numCoerceNonNegative(pricing.completion),
      numCoerceNonNegative(pricing.input_cache_read),
      numCoerceNonNegative(pricing.input_cache_write),
    );
    if (pricingEntry) {
      const idKey = toStringOrNull(m.id);
      const slugKey = toStringOrNull(m.canonical_slug);
      let variantSlugKey: string | null = null;
      if (idKey && slugKey) {
        const variantAt = idKey.lastIndexOf(":");
        if (variantAt > 0) variantSlugKey = `${slugKey}${idKey.slice(variantAt)}`;
      }
      const seen = new Set<string>();
      for (const key of [idKey, slugKey, variantSlugKey]) {
        if (!key) continue;
        for (const index of [key.toLowerCase(), normalizeModelKey(key)]) {
          if (!index || seen.has(index)) continue;
          seen.add(index);
          if (pricingRecord[index] === undefined) pricingRecord[index] = pricingEntry;
        }
      }
    }
    const benchmarks = obj(m.benchmarks);
    const aaBenchmarks = obj(benchmarks?.artificial_analysis);
    const intelligenceIndex = numCoerce(aaBenchmarks?.intelligence_index);
    const agenticIndex = numCoerce(aaBenchmarks?.agentic_index);
    if (intelligenceIndex == null && agenticIndex == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    const keys = new Set<string>();
    for (const value of [m.name, m.id, m.canonical_slug]) {
      if (typeof value === "string") {
        const key = normalizeModelKey(value);
        if (key) keys.add(key);
      }
    }
    for (const key of keys) {
      const cur = metaRecord[key];
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  return { pricing: pricingRecord, meta: metaRecord };
}

const CREATORS: Record<string, string> = {
  anthropic: "Anthropic",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  google: "Google",
  mistralai: "Mistral",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  openai: "OpenAI",
  qwen: "Qwen",
  xiaomi: "Xiaomi",
  groq: "Groq",
  cerebras: "Cerebras",
  fireworks: "Fireworks",
  moonshot: "Moonshot",
  zhipu: "Zhipu",
  stepfun: "StepFun",
  xai: "xAI",
};
export function creatorFromSlug(slug: unknown): string {
  if (typeof slug !== "string" || !slug.trim()) return "Unknown";
  const p = slug.split("/")[0]?.trim() || "Unknown";
  const lower = p.toLowerCase();
  if (Object.hasOwn(CREATORS, lower)) return CREATORS[lower]!;
  return p.split(/[-_]/).filter(Boolean).map(titleCase).join(" ");
}
const CODING_RE = /\b(?:coder|coding|code|codex)\b/;
const REASONING_RE = /\b(?:reasoning|thought)\b/;
const REASONING_SUFFIX_RE = /-(?:r1|o1)\b/;
export function categoryFrom(slug: unknown, name: unknown): OpenRouterRankEntry["category"] {
  const v = `${str(slug)} ${str(name)}`.toLowerCase();
  if (CODING_RE.test(v)) return "coding";
  if (REASONING_RE.test(v) || REASONING_SUFFIX_RE.test(v)) return "reasoning";
  return "general";
}
export function titleFromSlug(permaslug: unknown): string {
  if (typeof permaslug !== "string" || !permaslug.trim()) return "";
  const raw = permaslug.split("/").slice(1).join("/") || permaslug;
  return raw
    .replace(/[:/_]/g, " ")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((p) => (/^\d/.test(p) ? p.toLowerCase() : p.length <= 3 ? p.toUpperCase() : titleCase(p)))
    .join(" ");
}

const SUM_KEYS = [
  "total_prompt_tokens",
  "total_completion_tokens",
  "total_native_tokens_reasoning",
  "total_native_tokens_cached",
  "count",
  "total_tool_calls",
] as const;

function usageTotal(row: ModelRow): number {
  const rec = row as unknown as Record<string, unknown>;
  const p = numCoerce(rec?.total_prompt_tokens);
  const c = numCoerce(rec?.total_completion_tokens);
  if (p == null && c == null) return -1;
  return (p ?? 0) + (c ?? 0);
}

function rankingMetric(row: ModelRow): number | null {
  return numCoerce((row as unknown as Record<string, unknown>).rankingMetricValue);
}

interface Group {
  agg: ModelRow;
  dominant: ModelRow;
  dominantTokens: number;
  latest: ModelRow;
  latestTs: number;
  latestTokens: number;
  metric: number | null;
}

function changePercent(value: unknown): number | null {
  const n = numCoerce(value);
  return n == null ? null : n * 100;
}

type PricingLookup = Map<string, PricingEntry> | PricingRecord;

function lookupPricing(pricing: PricingLookup, key: string): PricingEntry | undefined {
  if (pricing instanceof Map) return pricing.get(key);
  return Object.hasOwn(pricing, key) ? pricing[key] : undefined;
}

function resolvePricing(pricing: PricingLookup, id: string, variantKey: string | undefined): PricingEntry | undefined {
  const keys = [variantKey, id].filter((k): k is string => typeof k === "string" && k !== "");
  for (const key of keys) {
    const hit = lookupPricing(pricing, key.toLowerCase());
    if (hit) return hit;
  }
  for (const key of keys) {
    const normalized = normalizeModelKey(key);
    if (!normalized) continue;
    const hit = lookupPricing(pricing, normalized);
    if (hit) return hit;
  }
  return undefined;
}

export interface RankingScanStats {
  scannedRows: number;
  validRows: number;
}

function groupRows(rows: unknown, stats?: RankingScanStats): Map<string, Group> {
  const grouped = new Map<string, Group>();
  if (!Array.isArray(rows)) return grouped;
  const count = Math.min(rows.length, MAX_DIRECTORY_ROWS);
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isRecord(raw)) continue;
    const idRaw = (raw as unknown as ModelRow).model_permaslug;
    if (!isValidRowId(idRaw)) continue;
    valid += 1;
    const row = raw as unknown as ModelRow;
    const id = (idRaw as string).trim();
    const tokens = usageTotal(row);
    const ts = parseTs(row.date);
    const metric = rankingMetric(row);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, {
        agg: { ...row, model_permaslug: id },
        dominant: row,
        dominantTokens: tokens,
        latest: row,
        latestTs: ts,
        latestTokens: tokens,
        metric,
      });
      continue;
    }
    for (const k of SUM_KEYS) {
      const cur = numCoerce(group.agg[k]);
      const add = numCoerce(row[k]);
      if (cur == null && add == null) continue;
      group.agg[k] = (cur ?? 0) + (add ?? 0);
    }
    if (tokens > group.dominantTokens) {
      group.dominant = row;
      group.dominantTokens = tokens;
    }
    if (ts > group.latestTs || (ts === group.latestTs && tokens > group.latestTokens)) {
      group.latest = row;
      group.latestTs = ts;
      group.latestTokens = tokens;
    }
    if (metric != null && (group.metric == null || metric > group.metric)) group.metric = metric;
  }
  if (stats) {
    stats.scannedRows = count;
    stats.validRows = valid;
  }
  return grouped;
}

interface RankedGroup {
  group: Group;
  derivedTokens: number;
}

function compareRanked(a: RankedGroup, b: RankedGroup): number {
  const am = a.group.metric;
  const bm = b.group.metric;
  if (am !== bm) {
    if (am == null) return 1;
    if (bm == null) return -1;
    return bm - am;
  }
  if (a.derivedTokens !== b.derivedTokens) return b.derivedTokens - a.derivedTokens;
  const aid = a.group.agg.model_permaslug;
  const bid = b.group.agg.model_permaslug;
  return aid === bid ? 0 : aid < bid ? -1 : 1;
}

export function mapModels(rows: unknown, pricing: PricingLookup, stats?: RankingScanStats): OpenRouterRankEntry[] {
  const ranked: RankedGroup[] = Array.from(groupRows(rows, stats).values()).map((group) => ({
    group,
    derivedTokens: usageTotal(group.agg),
  }));
  ranked.sort(compareRanked);
  const merged = ranked.slice(0, SOURCE_LIMITS.openRouterRankingModels);
  const out: OpenRouterRankEntry[] = [];
  for (let i = 0; i < merged.length; i++) {
    const { agg: row, dominant, latest } = merged[i]!.group;
    const id = row.model_permaslug;
    const name = titleFromSlug(id) || id;
    const variantKey = typeof dominant.variant_permaslug === "string" ? dominant.variant_permaslug : undefined;
    const resolved = resolvePricing(pricing, id, variantKey);
    const isFree = resolved
      ? resolved.input === 0 &&
        resolved.output === 0 &&
        (resolved.cacheHit == null || resolved.cacheHit === 0) &&
        (resolved.cacheWrite == null || resolved.cacheWrite === 0)
      : false;
    out.push({
      rank: i + 1,
      id,
      name,
      creator: creatorFromSlug(id),
      category: categoryFrom(id, name),
      variant: typeof dominant.variant === "string" && dominant.variant ? dominant.variant : null,
      totalTokens: numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0),
      promptTokens: numOr(row.total_prompt_tokens, 0),
      completionTokens: numOr(row.total_completion_tokens, 0),
      reasoningTokens: numOr(row.total_native_tokens_reasoning, 0),
      cachedTokens: numOr(row.total_native_tokens_cached, 0),
      toolCalls: numOr(row.total_tool_calls, 0),
      requestCount: numOr(row.count, 0),
      change: changePercent(latest.change),
      pricing: resolved ?? null,
      isFree,
    });
  }
  return out;
}

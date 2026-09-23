import {
  isRecord,
  isValidRowId,
  numCoerce,
  numCoerceNonNegative,
  numOr,
  obj,
  str,
  strOrNull,
  titleCase,
  isValidOpenRouterDirectoryRow,
} from "@/server/parsers/parser-primitives";
import { PER_MILLION, perMillionOrNull } from "@/server/config/limits";
import type { OpenRouterRankEntry } from "@/shared/types";

import { normalizeModelKey } from "@/shared/utils";

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
  const capped = rows.slice(0, 20_000);
  for (const raw of capped) {
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
      const idKey = strOrNull(m.id);
      const slugKey = strOrNull(m.canonical_slug);
      // Rankings address a variant by its dated permaslug, so a variant row needs that composed key.
      let variantSlugKey: string | null = null;
      if (idKey && slugKey) {
        const variantAt = idKey.lastIndexOf(":");
        if (variantAt > 0) variantSlugKey = `${slugKey}${idKey.slice(variantAt)}`;
      }
      for (const key of [idKey, slugKey, variantSlugKey]) {
        if (!key) continue;
        const norm = key.toLowerCase();
        if (!Object.hasOwn(pricingRecord, norm)) pricingRecord[norm] = pricingEntry;
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
    const keys = new Set(
      [m.name, m.id, m.canonical_slug].map((v) => (typeof v === "string" ? normalizeModelKey(v) : "")).filter(Boolean),
    );
    for (const key of keys) {
      const cur = Object.hasOwn(metaRecord, key) ? metaRecord[key] : undefined;
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

interface Group {
  agg: ModelRow;
  /** Highest-usage row; it is the single source for every per-variant field the entry exposes. */
  dominant: ModelRow;
  dominantTokens: number;
}

function changePercent(value: unknown): number | null {
  const n = numCoerce(value);
  return n == null ? null : n * 100;
}

function resolvePricing(
  pricingMap: Map<string, PricingEntry>,
  id: string,
  variantKey: string | undefined,
): PricingEntry | undefined {
  // Pricing keys are stored lowercased (see parseDirectoryRows); lookups normalize.
  return (variantKey ? pricingMap.get(variantKey.toLowerCase()) : undefined) ?? pricingMap.get(id.toLowerCase());
}

function groupRows(rows: unknown): Map<string, Group> {
  const grouped = new Map<string, Group>();
  if (!Array.isArray(rows)) return grouped;
  const capped = rows.slice(0, 20_000);
  for (const raw of capped) {
    if (!isRecord(raw)) continue;
    const idRaw = (raw as unknown as ModelRow).model_permaslug;
    if (!isValidRowId(idRaw)) continue;
    const row = raw as unknown as ModelRow;
    const id = (idRaw as string).trim();
    const tokens = usageTotal(row);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, {
        agg: { ...row, model_permaslug: id },
        dominant: row,
        dominantTokens: tokens,
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
  }
  return grouped;
}

export function mapModels(rows: unknown, pricingMap: Map<string, PricingEntry>): OpenRouterRankEntry[] {
  const grouped = groupRows(rows);
  const merged = Array.from(grouped.values()).sort((a, b) => usageTotal(b.agg) - usageTotal(a.agg));
  const out: OpenRouterRankEntry[] = [];
  for (let i = 0; i < merged.length; i++) {
    const { agg: row, dominant } = merged[i]!;
    const id = row.model_permaslug;
    const name = titleFromSlug(id) || id;
    const variantKey = typeof dominant.variant_permaslug === "string" ? dominant.variant_permaslug : undefined;
    const pricing = resolvePricing(pricingMap, id, variantKey);
    const isFree = pricing
      ? pricing.input === 0 && pricing.output === 0 && !pricing.cacheHit && !pricing.cacheWrite
      : undefined;
    out.push({
      rank: i + 1,
      id,
      name,
      creator: creatorFromSlug(id),
      category: categoryFrom(id, name),
      variant: typeof dominant.variant === "string" && dominant.variant ? dominant.variant : undefined,
      totalTokens: numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0),
      promptTokens: numOr(row.total_prompt_tokens, 0),
      completionTokens: numOr(row.total_completion_tokens, 0),
      reasoningTokens: numOr(row.total_native_tokens_reasoning, 0),
      cachedTokens: numOr(row.total_native_tokens_cached, 0),
      toolCalls: numOr(row.total_tool_calls, 0),
      requestCount: numOr(row.count, 0),
      change: changePercent(dominant.change),
      pricing,
      isFree,
    });
  }
  return out;
}

import type { OpenRouterRankEntry } from "@/shared/types";
import { numCoerce, numOr, titleCase } from "@/server/parsers/primitives";
import { isValidOpenRouterRowId } from "@/server/sources/data-filter";
import type { ModelRow, PricingEntry } from "@/server/sources/openrouter/types";

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
};
export function creatorFromSlug(slug: string): string {
  const p = slug.split("/")[0]?.trim() || "Unknown";
  const lower = p.toLowerCase();
  if (Object.hasOwn(CREATORS, lower)) return CREATORS[lower]!;
  return p.split(/[-_]/).filter(Boolean).map(titleCase).join(" ");
}
const CODING_RE = /\b(?:coder|coding|code|codex)\b/;
const REASONING_RE = /\b(?:reasoning|thought)\b/;
const REASONING_SUFFIX_RE = /-(?:r1|o1)\b/;
export function categoryFrom(slug: string, name: string): OpenRouterRankEntry["category"] {
  const v = `${slug} ${name}`.toLowerCase();
  if (CODING_RE.test(v)) return "coding";
  if (REASONING_RE.test(v) || REASONING_SUFFIX_RE.test(v)) return "reasoning";
  return "general";
}
export function titleFromSlug(permaslug: string): string {
  const raw = permaslug.split("/").slice(1).join("/") || permaslug;
  return raw
    .replace(/[:/_.]/g, " ")
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
  const p = numOr(row.total_prompt_tokens, NaN);
  const c = numOr(row.total_completion_tokens, NaN);
  if (!Number.isFinite(p) && !Number.isFinite(c)) return -1;
  return (Number.isFinite(p) ? p : 0) + (Number.isFinite(c) ? c : 0);
}

interface Group {
  agg: ModelRow;
  dominant: ModelRow;
  dominantTokens: number;
  latestDate: string;
}

function trackLatestChange(group: Group, row: ModelRow): void {
  const rowTime = row.date ? Date.parse(row.date) : NaN;
  const latestTime = group.latestDate ? Date.parse(group.latestDate) : NaN;
  const isLater =
    row.date != null &&
    row.date !== "" &&
    (!group.latestDate || (Number.isFinite(rowTime) && (!Number.isFinite(latestTime) || rowTime >= latestTime)));
  if (isLater) {
    group.latestDate = row.date;
    group.agg.date = row.date;
    const parsedChange = numCoerce(row.change);
    if (parsedChange != null) group.agg.change = parsedChange;
  } else if (!group.latestDate) {
    const parsedChange = numCoerce(row.change);
    if (parsedChange != null && group.agg.change == null) group.agg.change = parsedChange;
  }
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
  return (
    (variantKey ? pricingMap.get(variantKey) : undefined) ??
    (variantKey ? pricingMap.get(variantKey.toLowerCase()) : undefined) ??
    pricingMap.get(id) ??
    pricingMap.get(id.toLowerCase())
  );
}

export function mapModels(rows: ModelRow[], pricingMap: Map<string, PricingEntry>): OpenRouterRankEntry[] {
  const grouped = new Map<string, Group>();
  for (const row of rows) {
    if (!isValidOpenRouterRowId(row.model_permaslug)) continue;
    const id = row.model_permaslug.trim();
    const tokens = usageTotal(row);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, {
        agg: { ...row, model_permaslug: id },
        dominant: row,
        dominantTokens: tokens,
        latestDate: row.date ?? "",
      });
      continue;
    }
    for (const k of SUM_KEYS) {
      const cur = numOr(group.agg[k], NaN);
      const add = numOr(row[k], NaN);
      if (!Number.isFinite(cur) && !Number.isFinite(add)) continue;
      group.agg[k] = (Number.isFinite(cur) ? cur : 0) + (Number.isFinite(add) ? add : 0);
    }
    trackLatestChange(group, row);
    if (tokens > group.dominantTokens) {
      group.dominant = row;
      group.dominantTokens = tokens;
    }
  }
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
      change: changePercent(row.change),
      pricing,
      isFree,
    });
  }
  return out;
}

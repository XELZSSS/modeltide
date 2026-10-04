import { numOr, titleCase } from "@/server/parsers/parser-primitives";
import { SOURCE_LIMITS } from "@/server/config/limits";
import type { OpenRouterRankEntry } from "@/shared/types";
import {
  compareRanked,
  changePercent,
  groupRows,
  resolvePricing,
  usageTotal,
  type PricingLookup,
  type RankingScanStats,
} from "@/server/parsers/openrouter-aggregate";

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
  const slashAt = slug.indexOf("/");
  const owner = (slashAt === -1 ? slug : slug.slice(0, slashAt)).trim();
  if (!owner) return "Unknown";
  const lower = owner.toLowerCase();
  if (Object.hasOwn(CREATORS, lower)) return CREATORS[lower]!;
  return owner.split(/[-_]/).filter(Boolean).map(titleCase).join(" ");
}
const CODING_RE = /\b(?:coder|coding|code|codex)\b/;
const REASONING_RE = /\b(?:reasoning|thought)\b/;
const REASONING_SUFFIX_RE = /-(?:r1|o1)\b/;

function categoryOf(text: string): OpenRouterRankEntry["category"] | null {
  const v = text.toLowerCase();
  if (CODING_RE.test(v)) return "coding";
  if (REASONING_RE.test(v) || REASONING_SUFFIX_RE.test(v)) return "reasoning";
  return null;
}

export function categoryFrom(slug: unknown, name: unknown): OpenRouterRankEntry["category"] {
  // The regexes never match across the separator, so slug and name can be tested independently.
  if (typeof slug === "string" && slug) {
    const fromSlug = categoryOf(slug);
    if (fromSlug) return fromSlug;
  }
  if (typeof name === "string" && name) {
    const fromName = categoryOf(name);
    if (fromName) return fromName;
  }
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

export type { RankingScanStats };

export function mapModels(rows: unknown, pricing: PricingLookup, stats?: RankingScanStats): OpenRouterRankEntry[] {
  const ranked = Array.from(groupRows(rows, stats).values()).map((group) => ({
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

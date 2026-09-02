import type { OpenRouterRankEntry } from "@/shared/types";
import { numOr } from "@/server/parsers/primitives";

export interface ModelRow {
  date: string;
  model_permaslug: string;
  variant: string;
  variant_permaslug: string;
  total_completion_tokens: number;
  total_prompt_tokens: number;
  total_native_tokens_reasoning: number;
  count: number;
  image_output_requests: number;
  video_output_seconds: number;
  change: number | null;
}

export interface PricingEntry {
  prompt: number;
  completion: number;
  input_cache_read: number;
}

export type PricingRecord = Record<string, PricingEntry>;

/** AA agentic index (0-100), context window length and $/1M pricing, for cross-source backfill. */
export interface ModelMetaEntry {
  contextLength?: number;
  agenticIndex?: number;
  /** OpenRouter pricing converted from per-token to $/1M tokens. */
  pricing?: { input: number; output: number; cacheHit: number };
}

/** Effort/variant qualifier tokens stripped when building loose cross-source match keys. */
const QUALIFIER_TOKENS = new Set([
  "adaptive",
  "reasoning",
  "thinking",
  "effort",
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "ultra",
  "extended",
]);

/**
 * Loose match key for cross-source model matching: drops creator prefixes ("Org:" /
 * "org/"), parenthesized variant labels, effort qualifier tokens and all separators,
 * so "DeepSeek V4 Pro 0813 (Reasoning, Max Effort)" and "deepseek/deepseek-v4-pro-0813"
 * collapse to the same key. Both sides must normalize identically for a match.
 */
export function normalizeModelKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  const main = lowered.slice(Math.max(lowered.lastIndexOf(":"), lowered.lastIndexOf("/")) + 1);
  return main
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !QUALIFIER_TOKENS.has(t))
    .join("");
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
};

const toTitle = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

export function creatorFromSlug(slug: string): string {
  const p = slug.split("/")[0]?.trim() || "Unknown";
  const lower = p.toLowerCase();
  if (CREATORS[lower]) return CREATORS[lower]!;
  return p.split(/[-_]/).filter(Boolean).map(toTitle).join(" ");
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
    .map((p) =>
      // Version/size tokens ("4o", "3.5", "405b") keep their authored casing, short
      // acronyms ("gpt", "glm", "o1") uppercase, everything else title-cases.
      /^\d/.test(p) ? p.toLowerCase() : p.length <= 3 ? p.toUpperCase() : toTitle(p),
    )
    .join(" ");
}

/** Upstream `change` may arrive as a number or a numeric string; normalize to number|null. */
export function parseChange(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const SUM_KEYS = [
  "total_prompt_tokens",
  "total_completion_tokens",
  "total_native_tokens_reasoning",
  "count",
  "image_output_requests",
  "video_output_seconds",
] as const;

export function mapModels(rows: ModelRow[], pricingMap: Map<string, PricingEntry>): OpenRouterRankEntry[] {
  // Aggregate by model id: upstream emits one row per variant (standard/free/…),
  // but `id` is the app-wide row identity, so variants must merge into a single
  // entry. Usage fields are summed; the dominant variant (largest token total)
  // lends its variant label and pricing to the merged entry.
  interface Group {
    agg: ModelRow;
    dominant: ModelRow;
    dominantTokens: number;
  }
  const grouped = new Map<string, Group>();
  for (const row of rows) {
    const id = row.model_permaslug.trim();
    if (!id) continue;
    const tokens = numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, { agg: { ...row, model_permaslug: id }, dominant: row, dominantTokens: tokens });
      continue;
    }
    for (const k of SUM_KEYS) group.agg[k] = numOr(group.agg[k], 0) + numOr(row[k], 0);
    if (row.date && (!group.agg.date || row.date > group.agg.date)) group.agg.date = row.date;
    const parsedChange = parseChange(row.change);
    if (parsedChange != null) group.agg.change = parsedChange;
    if (tokens > group.dominantTokens) {
      group.dominant = row;
      group.dominantTokens = tokens;
    }
  }
  const merged = Array.from(grouped.values()).sort(
    (a, b) =>
      numOr(b.agg.total_prompt_tokens, 0) +
      numOr(b.agg.total_completion_tokens, 0) -
      (numOr(a.agg.total_prompt_tokens, 0) + numOr(a.agg.total_completion_tokens, 0)),
  );
  const out: OpenRouterRankEntry[] = [];
  for (let i = 0; i < merged.length; i++) {
    const { agg: row, dominant } = merged[i]!;
    const id = row.model_permaslug;
    const name = titleFromSlug(id) || id;
    const pricing = pricingMap.get(dominant.variant_permaslug) ?? pricingMap.get(id);
    const isFree = pricing
      ? pricing.prompt === 0 && pricing.completion === 0 && pricing.input_cache_read === 0
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
      requestCount: numOr(row.count, 0),
      imageOutputRequests: numOr(row.image_output_requests, 0),
      videoOutputSeconds: numOr(row.video_output_seconds, 0),
      change: parseChange(row.change),
      pricing,
      isFree,
    });
  }
  return out;
}

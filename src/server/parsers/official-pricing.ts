import type { OfficialPriceModel } from "@/shared/types";
import { MAX_PLAUSIBLE_RATE, PER_MILLION } from "@/shared/config/limits";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import { humanizeId, isRecord, numCoerce, str } from "@/server/parsers/primitives";
import { isUsablePricing } from "@/server/parsers/data-filter";

function officialModel(
  provider: string,
  id: string,
  name: string,
  input: number | null,
  output: number | null,
  cachedInput: number | null = null,
  cacheWrite: number | null = null,
): OfficialPriceModel | null {
  if (!isUsablePricing(input, output)) return null;
  if (input != null && input > MAX_PLAUSIBLE_RATE) return null;
  if (output != null && output > MAX_PLAUSIBLE_RATE) return null;
  if (cachedInput != null && cachedInput > MAX_PLAUSIBLE_RATE) return null;
  if (cacheWrite != null && cacheWrite > MAX_PLAUSIBLE_RATE) return null;
  return { id, name, provider, input, cachedInput, cacheWrite, output };
}

const PROVIDER_PREFIX_RULES: readonly (readonly [label: string, pattern: RegExp])[] = [
  ["openai", /^(gpt-|chatgpt-|o\d($|-))/i],
  ["anthropic", /^claude/i],
  ["google", /^(gemini|gemma)/i],
  ["deepseek", /^deepseek/i],
  ["mistral", /^(mistral|codestral|ministral|pixtral|magistral|devstral)/i],
  ["kimi", /^kimi/i],
  ["qwen", /^qwen/i],
  ["meta", /^llama/i],
  ["xai", /^grok/i],
  ["zhipu", /^glm/i],
  ["minimax", /^minimax/i],
  ["stepfun", /^step/i],
  ["cohere", /^command/i],
  ["moonshot", /^moonshot/i],
];

/** `litellm_provider` values seen in the wild mapped to our provider labels. */
const LITELLM_PROVIDER_ALIASES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  vertex_ai: "google",
  gemini: "google",
  deepseek: "deepseek",
  mistral: "mistral",
  moonshot: "moonshot",
  kimi: "kimi",
  qwen: "qwen",
  dashscope: "qwen",
  alibaba: "qwen",
  meta: "meta",
  llama: "meta",
  xai: "xai",
  zhipu: "zhipu",
  glm: "zhipu",
  minimax: "minimax",
  stepfun: "stepfun",
  step: "stepfun",
  cohere: "cohere",
  groq: "groq",
  cerebras: "cerebras",
  fireworks_ai: "fireworks",
  fireworks: "fireworks",
};

function resolveProviderFromLitellm(raw: unknown): string | null {
  const key = str(raw).trim().toLowerCase();
  if (!key) return null;
  if (Object.hasOwn(LITELLM_PROVIDER_ALIASES, key)) return LITELLM_PROVIDER_ALIASES[key]!;
  // Fall back to the id-prefix table so provider renames don't silently drop rows.
  return resolveProvider(key);
}

const CHAT_MODES = new Set(["chat", "completion"]);

function resolveProvider(id: string): string | null {
  for (const [label, pattern] of PROVIDER_PREFIX_RULES) {
    if (pattern.test(id)) return label;
  }
  return null;
}

export interface LitellmEntry {
  mode?: unknown;
  litellm_provider?: unknown;
  input_cost_per_token?: unknown;
  output_cost_per_token?: unknown;
  cache_read_input_token_cost?: unknown;
  cache_creation_input_token_cost?: unknown;
}

function toPricingModel(key: string, value: unknown, seen: Set<string>): OfficialPriceModel | null {
  if (!isRecord(value)) return null;
  const entry = value as LitellmEntry;
  const mode = str(entry.mode).trim().toLowerCase();
  if (mode && !CHAT_MODES.has(mode)) return null;
  const id = key.includes("/") ? (key.split("/").pop() ?? "") : key;
  if (!id || id.includes(":")) return null;
  // Prefer the explicit `litellm_provider` field; fall back to id prefixes so
  // new model families without a prefix rule still resolve.
  const provider = resolveProviderFromLitellm(entry.litellm_provider) ?? resolveProvider(id);
  if (!provider) return null;
  const input = numCoerce(entry.input_cost_per_token);
  const output = numCoerce(entry.output_cost_per_token);
  const cachedInput = numCoerce(entry.cache_read_input_token_cost);
  const cacheWrite = numCoerce(entry.cache_creation_input_token_cost);
  const model = officialModel(
    provider,
    id,
    humanizeId(id),
    input == null ? null : input * PER_MILLION,
    output == null ? null : output * PER_MILLION,
    cachedInput == null ? null : cachedInput * PER_MILLION,
    cacheWrite == null ? null : cacheWrite * PER_MILLION,
  );
  if (!model) return null;
  const dedupeKey = id.toLowerCase();
  if (seen.has(dedupeKey)) return null;
  seen.add(dedupeKey);
  return model;
}

export function parseLitellmPricing(raw: unknown): OfficialPriceModel[] {
  const spec = isRecord(raw) ? raw : undefined;
  if (!spec) throw new UpstreamError("LiteLLM pricing returned a non-object payload");
  const seen = new Set<string>();
  const models: OfficialPriceModel[] = [];
  let total = 0;
  let skippedUnknownProvider = 0;
  for (const [key, value] of Object.entries(spec)) {
    if (key === "sample_spec") continue;
    total += 1;
    const before = models.length;
    const model = toPricingModel(key, value, seen);
    if (model) {
      models.push(model);
    } else if (
      models.length === before &&
      resolveProvider(key.includes("/") ? (key.split("/").pop() ?? "") : key) == null
    ) {
      skippedUnknownProvider += 1;
    }
  }
  if (skippedUnknownProvider > 0) {
    console.warn(
      `[pricing] litellm: ${skippedUnknownProvider}/${total} entries skipped (unknown provider prefix), kept ${models.length}`,
    );
  }
  if (models.length === 0) {
    throw zeroUpstream("LiteLLM pricing", "usable rows", "schema drift?");
  }
  return models;
}

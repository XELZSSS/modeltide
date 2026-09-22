import {
  humanizeId,
  isRecord,
  numCoerce,
  numCoercePositive,
  str,
  isUsablePricing,
} from "@/server/parsers/parser-primitives";
import type { OfficialPriceModel } from "@/shared/types";
import { MAX_PLAUSIBLE_RATE, perMillionOrNull } from "@/shared/config/limits";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import type { LitellmEntry } from "@/server/parsers/upstream-types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

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
  if ([input, output, cachedInput, cacheWrite].some((v) => v != null && v > MAX_PLAUSIBLE_RATE)) return null;
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
  ["groq", /^(groq|llama-groq|mixtral-groq)/i],
  ["cerebras", /^cerebras/i],
  ["fireworks", /^fireworks/i],
];

/**
 * LiteLLM channel key -> the vendor whose own price list it is. Only a
 * provider's own endpoint counts as official pricing: marketplace and hosting
 * keys (openrouter, azure*, bedrock*, deepinfra, vercel_ai_gateway, cloudflare,
 * novita, together_ai, ...) are deliberately absent and now skipped, instead of
 * having the vendor guessed from the model id and their resale price presented
 * as the vendor's own. The entries below are the vendor-branded keys for
 * families already listed.
 */
const LITELLM_PROVIDER_ALIASES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  vertex_ai: "google",
  gemini: "google",
  palm: "google",
  deepseek: "deepseek",
  mistral: "mistral",
  codestral: "mistral",
  moonshot: "moonshot",
  kimi: "kimi",
  qwen: "qwen",
  dashscope: "qwen",
  alibaba: "qwen",
  qwen_ai_platform: "qwen",
  qwencloud: "qwen",
  meta: "meta",
  llama: "meta",
  meta_llama: "meta",
  xai: "xai",
  zhipu: "zhipu",
  glm: "zhipu",
  zai: "zhipu",
  minimax: "minimax",
  stepfun: "stepfun",
  step: "stepfun",
  cohere: "cohere",
  cohere_chat: "cohere",
  groq: "groq",
  cerebras: "cerebras",
  xiaomi_mimo: "xiaomi",
  "text-completion-openai": "openai",
  fireworks_ai: "fireworks",
  fireworks: "fireworks",
};

function resolveProviderFromLitellm(raw: unknown): string | null {
  const key = str(raw).trim().toLowerCase();
  if (!key) return null;
  if (Object.hasOwn(LITELLM_PROVIDER_ALIASES, key)) return LITELLM_PROVIDER_ALIASES[key]!;
  return resolveProvider(key);
}

const CHAT_MODES = new Set(["chat", "completion"]);

function resolveProvider(id: string): string | null {
  for (const [label, pattern] of PROVIDER_PREFIX_RULES) {
    if (pattern.test(id)) return label;
  }
  return null;
}

/** LiteLLM keys are `provider/model`; the leading segment is dropped. */
const bareId = (key: string): string => (key.split("/").pop() ?? key).trim();

/**
 * Failure reason when an entry can't become a pricing model, so the counter in
 * the caller can distinguish "unknown provider" (expected, noisy) from real
 * schema drift (a valid provider but unusable row).
 */
const UNKNOWN_PROVIDER = "unknown-provider" as const;

function toPricingModel(key: string, value: unknown): OfficialPriceModel | "skip" | typeof UNKNOWN_PROVIDER {
  if (!isRecord(value)) return "skip";
  const entry = value as LitellmEntry;
  const mode = str(entry.mode).trim().toLowerCase();
  if (mode && !CHAT_MODES.has(mode)) return "skip";
  const id = bareId(key);
  if (!id || id.length > 200 || id.includes(":") || id.includes(" ")) return "skip";
  // Only a provider's own entry counts as official pricing. Guessing the vendor
  // from the model id used to relabel resold rows (openrouter/azure/bedrock/
  // vercel/...) as that vendor's channel, so an unknown channel is skipped.
  const provider = resolveProviderFromLitellm(entry.litellm_provider);
  if (!provider) return UNKNOWN_PROVIDER;
  // A 0 rate means the entry has no price (LoRA adapters, free tiers), not that
  // the model is free: keeping it let $0.00 outrank the catalog price and be
  // labelled official.
  const input = numCoercePositive(entry.input_cost_per_token);
  const output = numCoercePositive(entry.output_cost_per_token);
  const cachedInput = numCoerce(entry.cache_read_input_token_cost);
  const cacheWrite = numCoerce(entry.cache_creation_input_token_cost);
  const model = officialModel(
    provider,
    id,
    humanizeId(id),
    perMillionOrNull(input),
    perMillionOrNull(output),
    perMillionOrNull(cachedInput),
    perMillionOrNull(cacheWrite),
  );
  return model ?? "skip";
}

/** Missing priced legs first, then the sum of what is priced. */
function priceRank(m: OfficialPriceModel): [number, number] {
  const legs = [m.input, m.output].filter((v): v is number => v != null);
  return [2 - legs.length, legs.reduce((a, b) => a + b, 0)];
}

function isCheaper(a: OfficialPriceModel, b: OfficialPriceModel): boolean {
  const [aMissing, aSum] = priceRank(a);
  const [bMissing, bSum] = priceRank(b);
  if (aMissing !== bMissing) return aMissing < bMissing;
  if (aSum !== bSum) return aSum < bSum;
  return a.provider < b.provider;
}

/**
 * One row per model id (case-insensitive). Upstream lists the same model under
 * several channels at disagreeing prices (gemma-7b-it at 0.05, 0.15 and 0.20),
 * and the client's index takes whichever row it meets first — so the cheapest
 * fully-priced entry wins here instead of the price depending on the order
 * LiteLLM happens to serialize its JSON in.
 */
function keepCheapest(index: Map<string, OfficialPriceModel>, model: OfficialPriceModel): void {
  const key = model.id.toLowerCase();
  const existing = index.get(key);
  if (!existing || isCheaper(model, existing)) index.set(key, model);
}

export function parseLitellmPricing(raw: unknown): ParseResult<OfficialPriceModel[]> {
  const spec = isRecord(raw) ? raw : undefined;
  if (!spec) return parseFail("LiteLLM pricing returned a non-object payload");
  const cheapest = new Map<string, OfficialPriceModel>();
  let total = 0;
  let skippedUnknownProvider = 0;
  // Upstream file is ~10k entries; cap the scan so a regressed payload can't
  // burn the Workers CPU budget on a single cron tick.
  const MAX_LITELLM_ENTRIES = 50_000;
  for (const [key, value] of Object.entries(spec)) {
    if (key === "sample_spec") continue;
    if (total >= MAX_LITELLM_ENTRIES) break;
    total += 1;
    const outcome = toPricingModel(key, value);
    if (outcome === "skip") continue;
    if (outcome === UNKNOWN_PROVIDER) {
      skippedUnknownProvider += 1;
      continue;
    }
    keepCheapest(cheapest, outcome);
  }
  const models = [...cheapest.values()];
  if (skippedUnknownProvider > 0) {
    console.warn(
      `[pricing] litellm: ${skippedUnknownProvider}/${total} entries skipped (channel is not a first-party provider), kept ${models.length}`,
    );
  }
  if (models.length === 0) {
    return parseFail(zeroUpstreamMessage("LiteLLM pricing", "usable rows", "schema drift?"));
  }
  return parseOk(models);
}

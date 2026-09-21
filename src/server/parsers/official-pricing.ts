import { humanizeId, isRecord, numCoerce, str, isUsablePricing } from "@/server/parsers/primitives";
import type { OfficialPriceModel } from "@/shared/types";
import { MAX_PLAUSIBLE_RATE, perMillionOrNull } from "@/shared/config/limits";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import type { LitellmEntry } from "@/server/parsers/upstream";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/result";

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
  ["groq", /^(groq|llama-groq|mixtral-groq)/i],
  ["cerebras", /^cerebras/i],
  ["fireworks", /^fireworks/i],
];

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
const bareId = (key: string): string => key.split("/").pop() ?? key;

function toPricingModel(key: string, value: unknown, seen: Set<string>): OfficialPriceModel | null {
  if (!isRecord(value)) return null;
  const entry = value as LitellmEntry;
  const mode = str(entry.mode).trim().toLowerCase();
  if (mode && !CHAT_MODES.has(mode)) return null;
  const id = bareId(key);
  if (!id || id.includes(":")) return null;
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
    perMillionOrNull(input),
    perMillionOrNull(output),
    perMillionOrNull(cachedInput),
    perMillionOrNull(cacheWrite),
  );
  if (!model) return null;
  const dedupeKey = `${provider}:${id.toLowerCase()}`;
  if (seen.has(dedupeKey)) return null;
  seen.add(dedupeKey);
  return model;
}

export function parseLitellmPricing(raw: unknown): ParseResult<OfficialPriceModel[]> {
  const spec = isRecord(raw) ? raw : undefined;
  if (!spec) return parseFail("LiteLLM pricing returned a non-object payload");
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
    } else if (models.length === before && resolveProvider(bareId(key)) == null) {
      skippedUnknownProvider += 1;
    }
  }
  if (skippedUnknownProvider > 0) {
    console.warn(
      `[pricing] litellm: ${skippedUnknownProvider}/${total} entries skipped (unknown provider prefix), kept ${models.length}`,
    );
  }
  if (models.length === 0) {
    return parseFail(zeroUpstreamMessage("LiteLLM pricing", "usable rows", "schema drift?"));
  }
  return parseOk(models);
}

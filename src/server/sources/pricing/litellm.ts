import type { OfficialPriceModel } from "@/shared/types";
import { MAX_PLAUSIBLE_RATE, PER_MILLION } from "@/shared/config/limits";
import { LITELLM_FETCH_OPTS, upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { humanizeId, isRecord, numCoerce, str } from "@/server/parsers/primitives";
import { isUsablePricing } from "@/server/sources/data-filter";

export function officialModel(
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
];

const CHAT_MODES = new Set(["chat", "completion"]);

function resolveProvider(id: string): string | null {
  for (const [label, pattern] of PROVIDER_PREFIX_RULES) {
    if (pattern.test(id)) return label;
  }
  return null;
}

interface LitellmEntry {
  mode?: unknown;
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
  const provider = resolveProvider(id);
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
  for (const [key, value] of Object.entries(spec)) {
    if (key === "sample_spec") continue;
    const model = toPricingModel(key, value, seen);
    if (model) models.push(model);
  }
  if (models.length === 0) {
    throw new UpstreamError("LiteLLM pricing yielded 0 usable rows (schema drift?)");
  }
  return models;
}

/** Raw fetch — no cache. The jsDelivr mirror was removed: the BerriAI/litellm
 * package exceeds jsDelivr's 50 MB limit so it permanently answers 403. */
export async function fetchLitellmPricing(ctx: AppContext): Promise<OfficialPriceModel[]> {
  const raw = await ctx.http.json<unknown>(`${upstreamConfig.githubRaw}${LITELLM_PRICING_PATH}`, LITELLM_FETCH_OPTS);
  return parseLitellmPricing(raw);
}

const LITELLM_PRICING_PATH = "/BerriAI/litellm/main/model_prices_and_context_window.json";

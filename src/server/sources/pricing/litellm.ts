import type { OfficialPriceModel } from "@/shared/types";
import { UPSTREAM_FETCH_OPTS, upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { humanizeId, isRecord, numCoerce, numPositive, str } from "@/server/parsers/primitives";
import { officialModel } from "@/server/sources/pricing/model";

const PROVIDER_PREFIX_RULES: readonly (readonly [label: string, pattern: RegExp])[] = [
  ["openai", /^(gpt-|o[134]($|-)|chatgpt-)/i],
  ["anthropic", /^claude/i],
  ["google", /^gemini/i],
  ["deepseek", /^deepseek/i],
  ["mistral", /^(mistral|codestral|ministral|pixtral|magistral|devstral)/i],
  ["kimi", /^kimi/i],
];

const CHAT_MODES = new Set(["chat", "completion"]);

const PER_MILLION = 1_000_000;

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
  max_input_tokens?: unknown;
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
  const contextWindow = numPositive(entry.max_input_tokens);
  const model = officialModel(
    provider,
    id,
    humanizeId(id),
    input == null ? null : input * PER_MILLION,
    output == null ? null : output * PER_MILLION,
    cachedInput == null ? null : cachedInput * PER_MILLION,
    contextWindow,
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

export async function getLitellmPricing(ctx: AppContext): Promise<OfficialPriceModel[]> {
  const raw = await ctx.http.json<unknown>(`${upstreamConfig.githubRaw}${LITELLM_PRICING_PATH}`, UPSTREAM_FETCH_OPTS);
  return parseLitellmPricing(raw);
}

const LITELLM_PRICING_PATH = "/BerriAI/litellm/main/model_prices_and_context_window.json";

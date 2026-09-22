import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import {
  categoryFrom,
  creatorFromSlug,
  mapModels,
  parseDirectoryRows,
  titleFromSlug,
  type PricingEntry,
} from "@/server/parsers/openrouter-parser";
import type { ModelRow } from "@/server/parsers/upstream-types";

beforeEach(() => resetModuleCachesForTests());

function row(over: Partial<ModelRow> = {}): ModelRow {
  return {
    date: "2026-08-01",
    model_permaslug: "openai/gpt-5",
    variant: "std",
    variant_permaslug: "openai/gpt-5",
    total_completion_tokens: 50,
    total_prompt_tokens: 100,
    total_native_tokens_reasoning: 10,
    total_native_tokens_cached: 0,
    count: 2,
    total_tool_calls: 0,
    change: 1,
    ...over,
  };
}

const pricing = new Map<string, PricingEntry>([
  ["openai/gpt-5", { input: 1, output: 2, cacheHit: 0.5, cacheWrite: 1.5 }],
]);

describe("creatorFromSlug / titleFromSlug / categoryFrom", () => {
  it.each([
    ["openai/gpt-5", "OpenAI"],
    ["meta-llama/llama-4", "Meta"],
    ["constructor/x", "Constructor"],
  ])("creatorFromSlug(%s) -> %s", (slug, expected) => {
    expect(creatorFromSlug(slug)).toBe(expected);
  });

  it.each([
    ["openai/gpt-5", "GPT 5"],
    ["solo-model", "Solo Model"],
    ["openai/gpt-4o", "GPT 4o"],
    ["openai/gpt-4.1-mini-2025-04-14", "GPT 4.1 Mini 2025 04 14"],
    ["openai/gpt-3.5-turbo", "GPT 3.5 Turbo"],
  ])("titleFromSlug(%s) -> %s", (slug, expected) => {
    expect(titleFromSlug(slug)).toBe(expected);
  });

  it.each([
    ["deepseek/deepseek-coder-v2", "DeepSeek Coder V2", "coding"],
    ["deepseek/deepseek-r1", "DeepSeek R1", "reasoning"],
  ])("categoryFrom(%s) -> %s", (slug, name, expected) => {
    expect(categoryFrom(slug, name)).toBe(expected);
  });
});

describe("parseDirectoryRows", () => {
  it("scales legs to per-million, nulling -1 sentinels", () => {
    const entry = parseDirectoryRows([
      {
        id: "acme/dynamic-model",
        pricing: {
          prompt: "0.000001",
          completion: "0.000002",
          input_cache_read: "-1",
          input_cache_write: "-1",
        },
      },
      {
        id: "acme/cached-model",
        pricing: {
          prompt: "0.000003",
          completion: "0.000015",
          input_cache_read: "0.0000003",
          input_cache_write: "0.00000375",
        },
      },
    ]);
    expect(entry.pricing["acme/dynamic-model"]).toEqual({
      input: 1,
      output: 2,
      cacheHit: null,
      cacheWrite: null,
    });
    expect(entry.pricing["acme/cached-model"]).toEqual({
      input: 3,
      output: 15,
      cacheHit: 0.3,
      cacheWrite: 3.75,
    });
  });

  it("mirrors a variant id onto its canonical slug", () => {
    const { pricing: record } = parseDirectoryRows([
      {
        id: "acme/model-2:free",
        canonical_slug: "acme/model-2-20260910",
        pricing: { prompt: "0", completion: "0" },
      },
    ]);
    const free = { input: 0, output: 0, cacheHit: null, cacheWrite: null };
    expect(record["acme/model-2:free"]).toEqual(free);
    expect(record["acme/model-2-20260910:free"]).toEqual(free);
  });
});

describe("mapModels", () => {
  it("aggregates rows by permaslug, taking variant, change and pricing from the dominant variant", () => {
    const models = mapModels(
      [
        row(),
        row({
          date: "2026-08-02",
          total_prompt_tokens: 10,
          change: null,
          total_native_tokens_cached: 7,
          total_tool_calls: 3,
        }),
        // Later date, tiny usage, drastic drop: a batch row must not lend its
        // change to an entry whose label and pricing come from the standard row.
        row({
          date: "2026-08-03",
          variant: "batch",
          variant_permaslug: "openai/gpt-5:batch",
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_native_tokens_reasoning: 0,
          count: 0,
          change: -0.9,
        }),
      ],
      pricing,
    );
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      rank: 1,
      id: "openai/gpt-5",
      name: "GPT 5",
      creator: "OpenAI",
      variant: "std",
      promptTokens: 110,
      completionTokens: 100,
      totalTokens: 210,
      requestCount: 4,
      reasoningTokens: 20,
      cachedTokens: 7,
      toolCalls: 3,
      change: 100,
      pricing: pricing.get("openai/gpt-5"),
    });
    expect(models[0]!.isFree).toBe(false);
  });

  it("marks free models and leaves pricing undefined when absent", () => {
    const free = new Map([["a/b", { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }]]);
    const [m] = mapModels([row({ model_permaslug: "a/b", variant_permaslug: "a/b" })], free);
    expect(m!.isFree).toBe(true);

    const [noPricing] = mapModels([row({ model_permaslug: "x/y", variant_permaslug: "x/y" })], new Map());
    expect(noPricing!.pricing).toBeUndefined();
    expect(noPricing!.isFree).toBeUndefined();
  });

  it("sorts by total tokens descending and ranks sequentially", () => {
    const models = mapModels(
      [
        row({ model_permaslug: "a/small", variant_permaslug: "a/small", total_prompt_tokens: 1 }),
        row({ model_permaslug: "b/big", variant_permaslug: "b/big", total_prompt_tokens: 999 }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["b/big", "a/small"]);
    expect(models.map((m) => m.rank)).toEqual([1, 2]);
  });

  it("keeps multi-variant rows without token data below genuine zero usage", () => {
    const missing: Partial<ModelRow> = {
      total_prompt_tokens: undefined,
      total_completion_tokens: undefined,
    };
    const models = mapModels(
      [
        row({ model_permaslug: "u/unknown", variant_permaslug: "u/unknown:a", ...missing }),
        row({ model_permaslug: "u/unknown", variant_permaslug: "u/unknown:b", ...missing }),
        row({
          model_permaslug: "z/zero",
          variant_permaslug: "z/zero",
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
        }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["z/zero", "u/unknown"]);
  });

  it("merges variant rows of one model into a single entry with dominant-variant pricing", () => {
    const variantPricing = new Map<string, PricingEntry>([
      ["a/b:standard", { input: 2, output: 3, cacheHit: 1, cacheWrite: 2 }],
      ["a/b:free", { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }],
    ]);
    const models = mapModels(
      [
        row({
          model_permaslug: "a/b",
          variant: "free",
          variant_permaslug: "a/b:free",
          total_prompt_tokens: 5,
          count: 1,
        }),
        row({
          model_permaslug: "a/b",
          variant: "standard",
          variant_permaslug: "a/b:standard",
          total_prompt_tokens: 900,
          count: 2,
          change: 0.5,
        }),
      ],
      variantPricing,
    );
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "a/b",
      promptTokens: 905,
      requestCount: 3,
      variant: "standard",
      pricing: variantPricing.get("a/b:standard"),
    });
    expect(models[0]!.isFree).toBe(false);
  });

  it("prices a dated variant permaslug through the mirrored key", () => {
    // The directory lists the paid base row before its variant, as upstream does.
    const { pricing: record } = parseDirectoryRows([
      {
        id: "acme/m",
        canonical_slug: "acme/m-20260910",
        pricing: { prompt: "0.000001", completion: "0.000002" },
      },
      {
        id: "acme/m:free",
        canonical_slug: "acme/m-20260910",
        pricing: { prompt: "0", completion: "0" },
      },
    ]);
    const [model] = mapModels(
      [row({ model_permaslug: "acme/m-20260910", variant: "free", variant_permaslug: "acme/m-20260910:free" })],
      new Map(Object.entries(record)),
    );
    expect(model!.isFree).toBe(true);
  });
});

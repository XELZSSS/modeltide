import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/cache/service";
import { categoryFrom, creatorFromSlug, mapModels } from "./parse-rankings";
import type { PricingEntry } from "./parse-directory";
import type { ModelRow } from "@/server/formats/wire-types";
import type { MetaLookup, RankingScanStats } from "./aggregate";

beforeEach(() => resetModuleCachesForTests());

type TestRow = ModelRow & { rankingMetricValue?: number };

function row(over: Partial<TestRow> = {}): TestRow {
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

describe("creatorFromSlug / categoryFrom", () => {
  it.each([
    ["openai/gpt-5", "OpenAI"],
    ["constructor/x", "Constructor"],
    ["z-ai/glm-5", "Z.ai"],
    ["nvidia/nemotron-4", "NVIDIA"],
    ["bytedance-seed/seed-oss", "ByteDance Seed"],
    ["ibm-granite/granite-4.0", "IBM Granite"],
    ["moonshotai/kimi-k2", "Moonshot AI"],
    ["text-embedding-3-large", "Unknown"],
  ])("creatorFromSlug(%s) -> %s", (slug, expected) => {
    expect(creatorFromSlug(slug)).toBe(expected);
  });

  it.each([
    ["deepseek/deepseek-coder-v2", "DeepSeek Coder V2", "coding"],
    ["deepseek/deepseek-r1", "DeepSeek R1", "reasoning"],
  ])("categoryFrom(%s) -> %s", (slug, name, expected) => {
    expect(categoryFrom(slug, name)).toBe(expected);
  });
});

describe("mapModels", () => {
  it("aggregates rows by permaslug, taking variant and pricing from the dominant row and change from the newest date", () => {
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
      change: -90,
      pricing: pricing.get("openai/gpt-5"),
    });
    expect(models[0]!.isFree).toBe(false);
  });

  it("marks free models and leaves pricing null when absent", () => {
    const free = new Map([["a/b", { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }]]);
    const [m] = mapModels([row({ model_permaslug: "a/b", variant_permaslug: "a/b" })], free);
    expect(m!.isFree).toBe(true);

    const [noPricing] = mapModels([row({ model_permaslug: "x/y", variant_permaslug: "x/y" })], new Map());
    expect(noPricing!.pricing).toBeNull();
    expect(noPricing!.isFree).toBe(false);
  });

  it("ranks by the upstream metric, not by the summed window total", () => {
    const models = mapModels(
      [
        row({
          model_permaslug: "a/window",
          variant_permaslug: "a/window",
          total_prompt_tokens: 500,
          total_completion_tokens: 0,
          rankingMetricValue: 400,
        }),
        row({
          model_permaslug: "a/window",
          variant_permaslug: "a/window:batch",
          date: "2026-07-20",
          total_prompt_tokens: 500,
          total_completion_tokens: 0,
          rankingMetricValue: 600,
        }),
        row({
          model_permaslug: "b/day",
          variant_permaslug: "b/day",
          total_prompt_tokens: 700,
          total_completion_tokens: 0,
          rankingMetricValue: 700,
        }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["b/day", "a/window"]);
    expect(models.map((m) => m.totalTokens)).toEqual([700, 1000]);
    expect(models.map((m) => m.rank)).toEqual([1, 2]);
  });

  it("keeps metric-less groups below metric-bearing ones and breaks metric ties by the derived total", () => {
    const models = mapModels(
      [
        row({
          model_permaslug: "no/metric",
          variant_permaslug: "no/metric",
          total_prompt_tokens: 9_000_000,
          total_completion_tokens: 0,
        }),
        row({
          model_permaslug: "with/small-metric",
          variant_permaslug: "with/small-metric",
          total_prompt_tokens: 1,
          total_completion_tokens: 0,
          rankingMetricValue: 1,
        }),
        row({
          model_permaslug: "tie/lower",
          variant_permaslug: "tie/lower",
          total_prompt_tokens: 5,
          total_completion_tokens: 0,
          rankingMetricValue: 42,
        }),
        row({
          model_permaslug: "tie/higher",
          variant_permaslug: "tie/higher",
          total_prompt_tokens: 50,
          total_completion_tokens: 0,
          rankingMetricValue: 42,
        }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["tie/higher", "tie/lower", "with/small-metric", "no/metric"]);
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
  });
});

describe("mapModels retirement accounting", () => {
  const expiryRow = (id: string) => row({ model_permaslug: id, variant_permaslug: id });
  const emptyStats = (): RankingScanStats => ({ scannedRows: 0, validRows: 0, expiredRows: 0 });
  const metaWith = (entries: Record<string, { expiresAt: string }>) => entries as unknown as MetaLookup;

  it("drops retired models and counts them apart from the valid rows", () => {
    const stats = emptyStats();
    const models = mapModels(
      [expiryRow("old-model"), expiryRow("live-model")],
      {},
      stats,
      metaWith({ "old-model": { expiresAt: "2020-01-01" } }),
    );

    expect(models.map((model) => model.id)).toEqual(["live-model"]);
    expect(stats.validRows).toBe(2);
    expect(stats.expiredRows).toBe(1);
  });

  it("leaves the retired counter at zero when nothing has expired", () => {
    const stats = emptyStats();
    const models = mapModels([expiryRow("live-model")], {}, stats, metaWith({}));

    expect(models).toHaveLength(1);
    expect(stats.expiredRows).toBe(0);
  });

  it("keeps ranking positions contiguous after a model is dropped", () => {
    const models = mapModels(
      [expiryRow("old-model"), expiryRow("live-model"), expiryRow("other-model")],
      {},
      emptyStats(),
      metaWith({ "old-model": { expiresAt: "2020-01-01" } }),
    );

    expect(models.map((model) => model.rank)).toEqual([1, 2]);
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/cache/service";
import { categoryFrom, creatorFromSlug } from "./naming";
import { mapModels } from "./parse-rankings";
import type { PricingEntry } from "./parse-directory";
import type { ModelRow } from "@/server/formats/wire-types";
import type { MetaLookup, RankingScanStats } from "./aggregate";

beforeEach(() => resetModuleCachesForTests());

type TestRow = ModelRow & { rankingMetricValue?: number };

function row(over: Partial<TestRow> = {}): TestRow {
  return {
    date: "2026-08-01",
    model_permaslug: "openai/gpt-6-1-sol-20260922",
    variant: "std",
    variant_permaslug: "openai/gpt-6-1-sol-20260922",
    total_completion_tokens: 50,
    total_prompt_tokens: 100,
    count: 2,
    change: 1,
    ...over,
  };
}

/** A usage row filed under one model id, for the cases where a variant adds nothing to the grouping. */
function sameSlugRow(modelPermaslug: string, over: Partial<TestRow> = {}): TestRow {
  return row({ model_permaslug: modelPermaslug, variant_permaslug: modelPermaslug, ...over });
}

/** A usage row with no completion tokens: the ranking metric alone decides its place. */
function metricRow(modelPermaslug: string, promptTokens: number, rankingMetricValue?: number): TestRow {
  return sameSlugRow(modelPermaslug, {
    total_prompt_tokens: promptTokens,
    total_completion_tokens: 0,
    rankingMetricValue,
  });
}

const FREE_PRICING: PricingEntry = { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 };

const pricing = new Map<string, PricingEntry>([
  ["openai/gpt-6-1-sol-20260922", { input: 1, output: 2, cacheHit: 0.5, cacheWrite: 1.5 }],
]);

/** The pricing lookup of a run that has seen no directory page. */
const noPricing = new Map<string, PricingEntry>();
const freePricing = new Map<string, PricingEntry>([["a/b", FREE_PRICING]]);

/** The scan counters before `mapModels` has read a row. */
function emptyStats(): RankingScanStats {
  return { scannedRows: 0, validRows: 0, expiredRows: 0, ratioFormChanges: 0, percentFormChanges: 0 };
}

function metaWith(entries: Record<string, { expiresAt: string }>): MetaLookup {
  return entries as unknown as MetaLookup;
}

/** Directory meta that retired `old-model` in 2020, long before any ranking window opens. */
const retiredOldModel = metaWith({ "old-model": { expiresAt: "2020-01-01" } });

describe("creatorFromSlug / categoryFrom", () => {
  it.each([
    ["openai/gpt-6-1-sol-20260922", "OpenAI"],
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
  it("aggregates rows by permaslug: dominant variant and pricing, newest change", () => {
    const models = mapModels(
      [
        row(),
        row({ date: "2026-08-02", total_prompt_tokens: 10, change: null }),
        row({
          date: "2026-08-03",
          variant: "batch",
          variant_permaslug: "openai/gpt-6-1-sol-20260922:batch",
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          count: 0,
          change: -0.9,
        }),
      ],
      pricing,
    );
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "openai/gpt-6-1-sol-20260922",
      name: "GPT 6 1 SOL 20260922",
      creator: "OpenAI",
      variant: "std",
      promptTokens: 110,
      completionTokens: 100,
      totalTokens: 210,
      requestCount: 4,
      change: -90,
      pricing: pricing.get("openai/gpt-6-1-sol-20260922"),
    });
    expect(models[0]!.isFree).toBe(false);
  });

  it.each([
    ["maps a zero-priced model to free", freePricing, { pricing: FREE_PRICING, isFree: true }],
    ["leaves pricing null and the model paid when the directory has none", noPricing, { pricing: null, isFree: false }],
  ])("%s", (_title, lookup, expected) => {
    const [model] = mapModels([sameSlugRow("a/b")], lookup);
    expect(model).toMatchObject(expected);
  });

  it("counts each reading of the ambiguous change unit so a payload that needs both is visible", () => {
    const stats = emptyStats();
    mapModels([sameSlugRow("a/ratio", { change: -0.9 }), sameSlugRow("b/percent", { change: 12 })], noPricing, stats);
    expect(stats.ratioFormChanges).toBe(1);
    expect(stats.percentFormChanges).toBe(1);
  });

  it("ranks by the upstream metric, not by the summed window total", () => {
    const models = mapModels(
      [
        metricRow("a/window", 500, 400),
        sameSlugRow("a/window", {
          variant_permaslug: "a/window:batch",
          date: "2026-07-20",
          total_prompt_tokens: 500,
          total_completion_tokens: 0,
          rankingMetricValue: 600,
        }),
        metricRow("b/day", 700, 700),
      ],
      noPricing,
    );
    expect(models.map((m) => m.id)).toEqual(["b/day", "a/window"]);
    expect(models.map((m) => m.totalTokens)).toEqual([700, 1000]);
  });

  it("keeps metric-less groups last and breaks metric ties by the derived total", () => {
    const models = mapModels(
      [
        metricRow("no/metric", 9_000_000),
        metricRow("with/small-metric", 1, 1),
        metricRow("tie/lower", 5, 42),
        metricRow("tie/higher", 50, 42),
      ],
      noPricing,
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
  it.each([
    [
      "drops retired models, keeps the surviving order and counts the drop",
      [sameSlugRow("old-model"), sameSlugRow("live-model"), sameSlugRow("other-model")],
      retiredOldModel,
      { ids: ["live-model", "other-model"], validRows: 3, expiredRows: 1 },
    ],
    [
      "leaves the retired counter at zero when nothing has expired",
      [sameSlugRow("live-model")],
      metaWith({}),
      { ids: ["live-model"], validRows: 1, expiredRows: 0 },
    ],
  ])("%s", (_title, rows, meta, expected) => {
    const stats = emptyStats();
    expect(mapModels(rows, {}, stats, meta).map((model) => model.id)).toEqual(expected.ids);
    expect(stats.validRows).toBe(expected.validRows);
    expect(stats.expiredRows).toBe(expected.expiredRows);
  });
});

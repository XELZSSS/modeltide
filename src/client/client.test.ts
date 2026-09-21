import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  formatTokens,
  formatScore,
  formatBoolean,
  formatShortNumber,
  formatDate,
  benchmarkLabel,
  categoryLabel,
  formatUptime,
  formatRelativeTime,
  formatTrend,
  formatDollar,
  formatPricePerMillion,
  safeHref,
} from "@/client/utils/format";
import { calcMonthlyCost } from "@/client/utils/cost-estimator";
import { getCachedMonthlyCost, useMonthlyCosts } from "@/client/pricing/cost-inputs";
import {
  indexOfficialPricing,
  makeOfficialGetter,
  matchOfficialPricing,
  resolveBlendedPrice,
  resolveEffectivePricing,
} from "@/client/utils/pricing-merge";
import { matchTerm, fuzzyMatch } from "@/shared/utils";
import {
  buildCompareRows,
  buildPriceRows,
  buildRadarData,
  computeWinners,
  radarMaxFor,
  type CompareRow,
  type RadarRow,
} from "@/client/features/compare/compare-logic";
import { aggregateTaskShare, formatTaskLabel, taskLabel } from "@/client/features/home/home-usage";
import { pickLatestReleaseName } from "@/client/features/home/use-home-stats";
import { buildReleaseRows } from "@/client/utils/release-feed";
import { resolveInitialTab } from "@/client/hooks/use-client-tab";
import { useParams } from "@/client/router";
import { isIosDevice, isStandaloneMode, unregisterStaleServiceWorker } from "@/client/pwa/use-pwa";
import { recentlyDegradedIds } from "@/client/utils/status-level";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  OfficialPriceModel,
  OpenSourceModelEntry,
  StatusEvent,
} from "@/shared/types";
import type { OfficialGetter } from "@/client/utils/pricing-merge";
import type { TFunction } from "@/shared/i18n";

const t = (overrides: Record<string, string> = {}): TFunction => {
  return ((key: string, params?: Record<string, unknown>) => {
    const val = overrides[key] ?? key;
    if (!params) return val;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val);
  }) as unknown as TFunction;
};
const tKey = ((key: string): string => key) as unknown as TFunction;
const NA = t({ notAvailable: "N/A" });

function makeModel(over: Partial<ArtificialAnalysisModel>): ArtificialAnalysisModel {
  return { id: "m", slug: "m", name: "M", intelligence_index: null, ...over };
}

function makeCompareModel(over: Partial<ArtificialAnalysisModel> = {}): ArtificialAnalysisModel {
  return {
    id: "m",
    slug: "m",
    name: "M",
    intelligence_index: 80,
    coding_index: 70,
    agentic_index: 60,
    model_creators: { name: "Creator", color: "#000" },
    release_date: "2024-01-01",
    is_open_weights: true,
    speed: { median_output_speed: 100 },
    benchmarks: { gpqa: 85, hle: 90, scicode: 75, ifbench: 88 },
    ...over,
  };
}

function makeOfficial(over: Partial<OfficialPriceModel>): OfficialPriceModel {
  return {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    input: 5,
    output: 25,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    ...over,
  };
}

function dailyCost(
  model: ArtificialAnalysisModel,
  dailyInput: number,
  dailyOutput: number,
  opts?: { dailyReasoning?: number; cacheHitRate?: number },
): number | null {
  return calcMonthlyCost(model, {
    dailyInput,
    dailyOutput,
    dailyReasoning: opts?.dailyReasoning,
    cacheHitRate: opts?.cacheHitRate ?? 0,
    cacheWriteRate: 0,
    daysPerMonth: 1,
  });
}

describe("formatters", () => {
  it("formats scores, numbers, money, dates and labels", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatShortNumber(1_500)).toBe("1.50K");
    expect(formatScore(t(), 85)).toBe("85.00");
    expect(formatBoolean(t({ yes: "Yes" }), true)).toBe("Yes");
    expect(formatTrend(-3.2)).toBe("-3.2%");
    expect(formatDollar(0.004)).toBe("$0.004");
    expect(formatPricePerMillion(0.005)).toBe("$0.01/M tokens");
    expect(formatDate("2024-01-15", "en")).toBe("1/15/2024");
    expect(formatUptime(t({ uptimeDays: "{days}d {hours}h" }), 172_800_000)).toBe("2d 0h");
    expect(formatRelativeTime(new Date().toISOString(), t({ timeJustNow: "just now" }))).toBe("just now");
    expect(benchmarkLabel("gpqa", t({ benchmarkGpqa: "GPQA" }))).toBe("GPQA");
    expect(categoryLabel("coding", t({ catCoding: "Coding" }))).toBe("Coding");
    expect(categoryLabel("unknown", t())).toBe("catGeneral");
  });

  it.each([[null], [undefined], [Number.NaN]])("renders missing values as N/A (%s)", (input) => {
    expect(formatTokens(input as never, NA)).toBe("N/A");
    expect(formatScore(NA, input as never)).toBe("N/A");
    expect(formatTrend(input as never, NA)).toBe("N/A");
    expect(formatDollar(input as never, NA)).toBe("N/A");
    expect(formatPricePerMillion(input as never, NA)).toBe("N/A");
  });
});

describe("safeHref", () => {
  it.each([
    ["/models?tab=x", "/models?tab=x"],
    ["https://ok.example/a", "https://ok.example/a"],
  ])("safeHref allows %s", (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });

  it.each([["//evil.example"], ["/\\evil.example"], ["javascript:alert(1)"], [null], ["   "]])(
    "safeHref rejects %s",
    (input) => {
      expect(safeHref(input as string)).toBeUndefined();
    },
  );
});

describe("calcMonthlyCost", () => {
  it("scales daily cost by days per month and clamps days to >= 1", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    const base = { dailyInput: 1_000_000, dailyOutput: 1_000_000, cacheHitRate: 0, cacheWriteRate: 0 };
    expect(calcMonthlyCost(model, { ...base, daysPerMonth: 22 })).toBe(3 * 22);
    expect(calcMonthlyCost(model, { ...base, daysPerMonth: 0 })).toBe(3);
  });

  it("forwards reasoning and cache settings", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cacheHit: 1 } });
    expect(
      calcMonthlyCost(model, {
        dailyInput: 2_000_000,
        dailyOutput: 0,
        dailyReasoning: 1_000_000,
        cacheHitRate: 0.5,
        cacheWriteRate: 0,
        daysPerMonth: 22,
      }),
    ).toBe(13 * 22);
  });

  it.each([
    ["input+output from per-million prices", { input: 1, output: 2, cacheHit: 0.1 }, [1_000_000, 1_000_000, {}], 3],
    [
      "splits cached/uncached by rate",
      { input: 10, output: 2, cacheHit: 1 },
      [2_000_000, 0, { cacheHitRate: 0.5 }],
      11,
    ],
    ["clamps low hit rate", { input: 10, output: 2, cacheHit: 1 }, [1_000_000, 0, { cacheHitRate: -1 }], 10],
    ["clamps negative tokens", { input: 1, output: 2, cacheHit: null }, [-5, -5, {}], 0],
  ])("%s", (_label, pricing, args, expected) => {
    const [input, output, opts] = args as [number, number, { dailyReasoning?: number; cacheHitRate?: number }];
    expect(dailyCost(makeModel({ pricing: pricing as never }), input, output, opts)).toBe(expected);
  });

  it("returns null for missing pricing and non-finite tokens", () => {
    expect(dailyCost(makeModel({}), 1_000_000, 1_000_000)).toBeNull();
    expect(dailyCost(makeModel({ pricing: { cacheHit: 0.1 } }), 1_000_000, 1_000_000)).toBeNull();
    expect(
      dailyCost(makeModel({ pricing: { input: 1, output: 2, cacheHit: null } }), Number.NaN, 1_000_000),
    ).toBeNull();
  });
});

describe("fuzzyMatch", () => {
  const items = [{ name: "claude-opus-4" }, { name: "gpt-5" }, { name: "deepseek-r1" }];
  const fields = (m: { name: string }) => [m.name];

  it("rescues typo queries the tiered matcher misses", () => {
    expect(matchTerm(["claude-opus-4"], "calude").matched).toBe(false);
    expect(fuzzyMatch(items, "calude", fields).map((m) => m.name)).toContain("claude-opus-4");
  });

  it("returns empty when nothing matches or input is empty", () => {
    expect(fuzzyMatch(items, "zzzqqq", fields)).toEqual([]);
    expect(fuzzyMatch([], "claude", fields)).toEqual([]);
  });
});

interface M {
  id: string;
  score: number | null;
  cost: number | null;
}

const models: M[] = [
  { id: "a", score: 90, cost: 1 },
  { id: "b", score: 70, cost: 1 },
  { id: "c", score: null, cost: 3 },
];

const getKey = (m: M) => m.id;

describe("computeWinners", () => {
  it("marks the best value as win for max metrics", () => {
    const rows: CompareRow<M>[] = [{ label: "score", getNumeric: (m) => m.score, bestIs: "max" }];
    const winners = computeWinners(rows, models, getKey);
    expect(winners.get("score")?.get("a")).toBe("win");
    expect(winners.get("score")?.get("b")).toBeUndefined();
    expect(winners.get("score")?.get("c")).toBeUndefined();
  });

  it("marks best and worst for min metrics", () => {
    const rows: CompareRow<M>[] = [{ label: "cost", getNumeric: (m) => m.cost, bestIs: "min", worstIs: "max" }];
    const winners = computeWinners(rows, models, getKey)!;
    expect(winners.get("cost")?.get("a")).toBe("win");
    expect(winners.get("cost")?.get("c")).toBe("loss");
  });

  it("still marks a winner when values differ beyond display precision", () => {
    const close: M[] = [
      { id: "x", score: 88.41, cost: null },
      { id: "y", score: 88.5, cost: null },
    ];
    const winners = computeWinners(
      [{ label: "score", getNumeric: (m) => m.score, bestIs: "max", worstIs: "min" }],
      close,
      getKey,
    );
    expect(winners.get("score")?.get("y")).toBe("win");
    expect(winners.get("score")?.get("x")).toBe("loss");
  });

  it("skips rows without a direction or with fewer than two numeric values", () => {
    expect(
      computeWinners(
        [
          { label: "noDirection", getNumeric: (m) => m.score },
          { label: "noAccessor", bestIs: "max" },
          { label: "singleValue", getNumeric: (m) => (m.id === "a" ? 1 : null), bestIs: "min" },
        ],
        models,
        getKey,
      ).size,
    ).toBe(0);
  });
});

describe("buildRadarData / radarMaxFor", () => {
  it("builds radar data for a single model", () => {
    const data = buildRadarData(tKey, [makeCompareModel()]);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ metric: "intelligence", values: { m: 80 } });
    expect(data[1]).toEqual({ metric: "coding", values: { m: 70 } });
    expect(data[2]).toEqual({ metric: "agentic", values: { m: 60 } });
    expect(data[3]).toEqual({ metric: "gpqa", values: { m: 85 } });
    expect(data[6]).toEqual({ metric: "ifbench", values: { m: 88 } });
  });

  it("keys values by model id, nulls missing benchmarks and handles an empty list", () => {
    const multi = buildRadarData(tKey, [makeCompareModel(), makeCompareModel({ id: "b", intelligence_index: 90 })]);
    expect(multi[0]!.values["m"]).toBe(80);
    expect(multi[0]!.values["b"]).toBe(90);
    expect(buildRadarData(tKey, [makeCompareModel({ benchmarks: {} })])[3]!.values["m"]).toBeNull();
    expect(buildRadarData(tKey, [])[0]).toEqual({ metric: "intelligence", values: {} });
  });

  it.each([
    [[], 100, 100],
    [[{ metric: "intelligence", values: { m: null } }], 100, 100],
    [[{ metric: "x", values: { m: 101 } }], 100, 120],
    [[{ metric: "x", values: { m: 121 } }], 100, 140],
    [[{ metric: "x", values: { m: 10 } }], 20, 20],
  ])("radarMaxFor(%j, %s) -> %s", (data, fallback, expected) => {
    expect(radarMaxFor(data as RadarRow[], fallback)).toBe(expected);
  });
});

describe("buildCompareRows / buildPriceRows", () => {
  const metrics = buildCompareRows(tKey);
  const rows = buildPriceRows(tKey);

  it("includes score/percent/speed/open-weights metrics", () => {
    expect(metrics.find((m) => m.label === "intelligenceIndex")?.bestIs).toBe("max");
    expect(metrics.find((m) => m.label === "gpqa")?.getNumeric?.(makeCompareModel())).toBe(85);
    expect(metrics.find((m) => m.label === "outputSpeed")?.bestIs).toBe("max");
    expect(metrics.find((m) => m.label === "openWeights")).toBeDefined();
  });

  it("computes getValue, N/A for missing", () => {
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex")!;
    expect(intelMetric.getValue!(makeCompareModel())).toBe("80.00");
    expect(intelMetric.getValue!(makeCompareModel({ intelligence_index: null }))).toBe("notAvailable");
  });

  it("marks cheapest win and priciest loss on every leg", () => {
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.bestIs).toBe("min");
      expect(row.worstIs).toBe("max");
    }
    const winners = computeWinners(
      rows,
      [
        makeCompareModel({ id: "cheap", pricing: { input: 1, output: 10 } }),
        makeCompareModel({ id: "mid", pricing: { input: 2, output: 20 } }),
        makeCompareModel({ id: "deep", pricing: { input: 3, output: 30 } }),
      ],
      (m) => m.id,
    );
    expect(winners.get("promptPrice")?.get("cheap")).toBe("win");
    expect(winners.get("promptPrice")?.get("deep")).toBe("loss");
    expect(winners.get("completionPrice")?.get("cheap")).toBe("win");
    expect(winners.get("completionPrice")?.get("deep")).toBe("loss");
  });

  it("ranks on official prices once they arrive instead of the router catalogue", () => {
    const getOfficial: OfficialGetter = (m) =>
      m.id === "cheap" ? makeOfficial({ input: 9, output: 90, cachedInput: 9, cacheWrite: 9 }) : undefined;
    const officialRows = buildPriceRows(tKey, getOfficial);
    const cheap = makeCompareModel({ id: "cheap", pricing: { input: 1, output: 10 } });
    const mid = makeCompareModel({ id: "mid", pricing: { input: 2, output: 20 } });
    const winners = computeWinners(officialRows, [cheap, mid], (m) => m.id);
    expect(winners.get("promptPrice")?.get("mid")).toBe("win");
    expect(winners.get("promptPrice")?.get("cheap")).toBe("loss");
    expect(officialRows[0]?.getNumeric?.(cheap)).toBe(9);
    expect(officialRows[1]?.getNumeric?.(mid)).toBe(20);
  });
});

describe("official price resolution", () => {
  const official = makeOfficial({});
  const index = indexOfficialPricing([official]);

  it.each([
    ["GPT-5 (Reasoning, High Effort)", "gpt-5"],
    ["GPT-5", "gpt-5"],
  ])("matches catalog variant %s to official %s", (name, id) => {
    expect(matchOfficialPricing(index, makeModel({ name }))?.id).toBe(id);
  });

  it.each([
    [
      "official legs win per-leg, catalog fills gaps",
      { input: 10, output: 50, cacheHit: 1 },
      { output: null },
      { input: 5, output: 50, cacheHit: 0.5, cacheWrite: 6.25, source: "official" },
    ],
  ])("%s", (_label, catalog, officialOver, expected) => {
    expect(resolveEffectivePricing(catalog as never, makeOfficial(officialOver))).toEqual(expected);
  });

  it("falls back to catalog without an official match, null source when nothing resolves", () => {
    expect(resolveEffectivePricing({ input: 10, output: 50, cacheHit: 1 })).toEqual({
      input: 10,
      output: 50,
      cacheHit: 1,
      cacheWrite: null,
      source: "catalog",
    });
    expect(resolveEffectivePricing(undefined, null).source).toBeNull();
  });

  it.each([[{ input: 10, output: 50, cacheHit: 1 }, makeOfficial({}), 3.85]])(
    "resolveBlendedPrice(%j)",
    (pricing, officialPrice, expected) => {
      expect(resolveBlendedPrice(makeModel({ pricing: pricing as never }), officialPrice)).toBeCloseTo(expected, 5);
    },
  );

  it("monthly cost uses official legs when matched, bills write tier", () => {
    const opts = {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      cacheWriteRate: 0,
      daysPerMonth: 1,
    };
    const model = makeModel({ pricing: { input: 10, output: 50, cacheHit: null } });
    expect(calcMonthlyCost(model, opts)).toBe(60);
    expect(calcMonthlyCost(model, opts, official)).toBe(30);
  });

  it.each([[{ input: 10, output: 0, cacheHit: 1, cacheWrite: 30 }, 0.5 * 1 + 0.2 * 30 + 0.3 * 10]])(
    "monthly cost write-tier handling %j",
    (pricing, expected) => {
      expect(
        calcMonthlyCost(makeModel({ pricing: pricing as never }), {
          dailyInput: 1_000_000,
          dailyOutput: 0,
          cacheHitRate: 0.5,
          cacheWriteRate: 0.2,
          daysPerMonth: 1,
        }),
      ).toBeCloseTo(expected, 5);
    },
  );
});

describe("monthly cost default fast path", () => {
  const defaultCalc = { input: 2, output: 1, reasoning: 2, cache: 0.5, cacheWrite: 0.05, days: 22 };

  it("reuses the server precomputed default when unmatched", () => {
    expect(getCachedMonthlyCost(makeModel({ defaultMonthlyCost: 123 }), defaultCalc, undefined)).toBe(123);
    expect(
      getCachedMonthlyCost(makeModel({ defaultMonthlyCost: 123 }), defaultCalc, makeOfficialGetter([makeOfficial({})])),
    ).toBe(123);
  });

  it("recomputes from official legs when matched", () => {
    expect(
      getCachedMonthlyCost(
        makeModel({ name: "GPT-5", defaultMonthlyCost: 123, pricing: { input: 10, output: 50, cacheHit: null } }),
        defaultCalc,
        makeOfficialGetter([makeOfficial({})]),
      ),
    ).toBeCloseTo(1773.75, 5);
  });
});

describe("useMonthlyCosts", () => {
  const gpt = () => makeModel({ id: "gpt-5", name: "GPT-5", pricing: { input: 10, output: 50, cacheHit: null } });
  const cheap = () => makeModel({ id: "cheap", name: "Cheap", pricing: { input: 1, output: 2, cacheHit: null } });

  it("recomputes monthly costs when official pricing arrives after mount", () => {
    const hookModels = [gpt()];
    const { result, rerender } = renderHook(({ getOfficial }) => useMonthlyCosts(hookModels, getOfficial), {
      initialProps: { getOfficial: undefined as OfficialGetter | undefined },
    });
    expect(result.current.monthlyCosts.get("gpt-5")).toBe(3740);
    rerender({ getOfficial: makeOfficialGetter([makeOfficial({})]) });
    expect(result.current.monthlyCosts.get("gpt-5")).toBeCloseTo(1773.75, 5);
  });

  it("emits no catalog numbers before pricing is ready", () => {
    const hookModels = [gpt()];
    const { result, rerender } = renderHook(
      ({ getOfficial, ready }) => useMonthlyCosts(hookModels, getOfficial, { ready }),
      { initialProps: { getOfficial: undefined as OfficialGetter | undefined, ready: false } },
    );
    expect(result.current.monthlyCosts.size).toBe(0);
    rerender({ getOfficial: makeOfficialGetter([makeOfficial({})]), ready: true });
    expect(result.current.monthlyCosts.get("gpt-5")).toBeCloseTo(1773.75, 5);
  });

  it("keys costs by model id so list order cannot shift a cost onto another model", () => {
    const { result } = renderHook(() => useMonthlyCosts([cheap(), gpt()]));
    expect(result.current.monthlyCosts.get("gpt-5")).toBe(3740);
    expect(result.current.monthlyCosts.get("cheap")).not.toBe(result.current.monthlyCosts.get("gpt-5"));
  });
});

describe("aggregateTaskShare", () => {
  const task = (value: string | null) => ({ task: value });

  it("counts models per task sorted descending, tail folded into other", () => {
    const { slices, total } = aggregateTaskShare([
      task("text-generation"),
      task("text-to-image"),
      task("text-generation"),
      task(null),
    ]);
    expect(slices).toEqual([
      { key: "text-generation", total: 2 },
      { key: "text-to-image", total: 1 },
      { key: "__other__", total: 1 },
    ]);
    expect(total).toBe(4);
  });

  it("resolves localized labels with English fallback", () => {
    const tf = (key: string) => (key === "taskTextGeneration" ? "\u6587\u672c\u751f\u6210" : key);
    expect(taskLabel("text-generation", tf)).toBe("\u6587\u672c\u751f\u6210");
    expect(taskLabel("some-new-task", tf)).toBe("Some New Task");
    expect(formatTaskLabel("automatic_speech_recognition")).toBe("Automatic Speech Recognition");
  });
});

describe("recentlyDegradedIds", () => {
  const ev = (type: StatusEvent["type"], id: StatusEvent["id"]): StatusEvent => ({
    id,
    type,
    at: new Date().toISOString(),
    durationMin: null,
  });

  it("collects only degraded sources, ignoring up and down events", () => {
    const ids = recentlyDegradedIds([
      ev("down", "openrouter"),
      ev("degraded", "anthropicApi"),
      ev("up", "anthropicApi"),
      ev("degraded", "groqApi"),
    ]);
    expect([...ids].sort()).toEqual(["anthropicApi", "groqApi"]);
  });

  it("is empty without degraded events", () => {
    expect(recentlyDegradedIds([]).size).toBe(0);
    expect(recentlyDegradedIds([ev("up", "news"), ev("down", "news")]).size).toBe(0);
  });
});

describe("pickLatestReleaseName / resolveInitialTab", () => {
  const closed = (releaseDate: string, model = "Closed Model"): ClosedReleaseEntry => ({
    id: model,
    model,
    provider: "Lab",
    releaseDate,
    link: "https://example.com",
  });
  const hf = (id: string, createdAt: string): OpenSourceModelEntry => ({
    id,
    author: null,
    downloads: 0,
    likes: 0,
    license: "apache-2.0",
    task: null,
    createdAt,
    lastModified: null,
    tags: [],
  });

  it.each([
    [[], [closed("2026-09-05"), closed("2026-09-01")], "Closed Model"],
    // Regression: a newer Hugging Face creation must win over the AA head,
    // matching what the releases page shows in its first row.
    [[hf("org/newest", "2026-09-06T04:54:00Z")], [closed("2026-09-05")], "newest"],
    [[], [closed("not-a-date")], null],
  ])("pickLatestReleaseName(%j, %j)", (hfFeed, aaFeed, expected) => {
    expect(pickLatestReleaseName(hfFeed as OpenSourceModelEntry[], aaFeed as ClosedReleaseEntry[])).toBe(expected);
  });

  it("resolveInitialTab accepts deep-link, falls back otherwise", () => {
    const tabs = ["feed", "closed"] as const;
    expect(resolveInitialTab(tabs, "closed", "feed")).toBe("closed");
    expect(resolveInitialTab(tabs, null, "feed")).toBe("feed");
    expect(resolveInitialTab(tabs, "nope", "feed")).toBe("feed");
  });
});

describe("buildReleaseRows", () => {
  const hf = (id: string, createdAt: string | null, lastModified: string | null = null): OpenSourceModelEntry => ({
    id,
    author: null,
    downloads: 0,
    likes: 0,
    license: "apache-2.0",
    task: null,
    createdAt,
    lastModified,
    tags: [],
  });
  const aa = (id: string, releaseDate: string): ClosedReleaseEntry => ({
    id,
    model: `Model ${id}`,
    provider: "Lab",
    releaseDate,
    link: `https://example.com/${id}`,
  });

  it("merges both sources into one list, newest first, with no open/closed field", () => {
    const rows = buildReleaseRows([hf("meta-llama/older", "2026-01-01T00:00:00Z")], [aa("newest", "2026-09-05")]);
    expect(rows.map((r) => r.name)).toEqual(["Model newest", "older"]);
    expect(rows.map((r) => r.provider)).toEqual(["Lab", "Hugging Face"]);
    expect(rows.map((r) => r.id)).toEqual(["aa:newest", "hf:meta-llama/older@2026-01-01"]);
    expect(rows.every((r) => !("type" in r))).toBe(true);
  });

  it("collapses a same-day create and modify into a single event", () => {
    const rows = buildReleaseRows([hf("org/model", "2026-03-04T01:00:00Z", "2026-03-04T23:00:00Z")], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe("2026-03-04");
  });

  it("keeps a modify from a later day as its own event", () => {
    const rows = buildReleaseRows([hf("org/model", "2026-03-04T00:00:00Z", "2026-03-06T00:00:00Z")], []);
    expect(rows.map((r) => r.date)).toEqual(["2026-03-06", "2026-03-04"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("drops releases whose date cannot be parsed", () => {
    expect(buildReleaseRows([], [aa("bad", "not-a-date")])).toEqual([]);
  });
});

describe("useParams", () => {
  it("re-parses dynamic segments when the path changes under the same pattern", async () => {
    window.history.replaceState(null, "", "/model/aa/old-model");
    const { result } = renderHook(() => useParams<{ source: string; wildcard: string }>("/model/:source/*"));
    expect(result.current).toEqual({ source: "aa", wildcard: "old-model" });

    window.history.replaceState(null, "", "/model/aa/new-model");
    await act(async () => {
      window.dispatchEvent(new Event("routechange"));
    });
    expect(result.current).toEqual({ source: "aa", wildcard: "new-model" });

    window.history.replaceState(null, "", "/");
    await act(async () => {
      window.dispatchEvent(new Event("routechange"));
    });
    expect(result.current).toEqual({ wildcard: "" });
  });

  it("keeps malformed percent-encoding as the raw segment instead of throwing", () => {
    window.history.replaceState(null, "", "/model/aa/%E0%A4%A");
    const { result } = renderHook(() => useParams<{ source: string; wildcard: string }>("/model/:source/*"));
    expect(result.current).toEqual({ source: "aa", wildcard: "%E0%A4%A" });
    window.history.replaceState(null, "", "/");
  });
});

describe("isIosDevice / isStandaloneMode", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", undefined, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5, true],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", undefined, false],
  ])("isIosDevice(%s)", (ua, touchPoints, expected) => {
    expect(isIosDevice(ua, touchPoints as never)).toBe(expected);
  });

  it.each([
    [{ displayStandalone: true }, true],
    [{}, false],
  ])("isStandaloneMode(%j) -> %s", (input, expected) => {
    expect(isStandaloneMode(input)).toBe(expected);
  });
});

describe("unregisterStaleServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("unregisters every registration outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const unregister = vi.fn(async () => true);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] },
    });
    unregisterStaleServiceWorker();
    await vi.waitFor(() => {
      expect(unregister).toHaveBeenCalledTimes(2);
    });
  });
});

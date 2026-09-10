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
import { getCachedMonthlyCost, useMonthlyCosts } from "@/client/features/pricing/cost-inputs";
import {
  indexOfficialPricing,
  makeOfficialGetter,
  matchOfficialPricing,
  resolveBlendedPrice,
  resolveEffectivePricing,
} from "@/client/utils/pricing-merge";
import { matchTerm } from "@/shared/utils";
import { fuzzyMatch } from "@/client/utils/fuzzy";
import {
  buildCompareRows,
  buildRadarData,
  computeWinners,
  radarMaxFor,
  type CompareRow,
} from "@/client/features/compare/logic";
import { aggregateTaskShare, formatTaskLabel, taskLabel } from "@/client/features/home/usage";
import { pickLatestReleaseName } from "@/client/features/home/use-home-stats";
import { resolveInitialTab } from "@/client/hooks/use-client-tab";
import { useParams } from "@/client/router";
import { isIosDevice, isStandaloneMode, unregisterStaleServiceWorker } from "@/client/pwa/use-pwa";
import type { ArtificialAnalysisModel, ClosedReleaseEntry, OfficialPriceModel } from "@/shared/types";
import type { OfficialGetter } from "@/client/utils/pricing-merge";
import type { TFunction } from "@/shared/i18n";

const t = (overrides: Record<string, string> = {}): TFunction => {
  return ((key: string, params?: Record<string, unknown>) => {
    const val = overrides[key] ?? key;
    if (!params) return val;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val);
  }) as unknown as TFunction;
};

describe("formatTokens", () => {
  it("formats small token counts as-is", () => {
    expect(formatTokens(100)).toBe("100");
  });
  it("shows one decimal for kilo tokens instead of rounding up to the next K", () => {
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(128_000)).toBe("128K");
  });
  it("formats millions with M suffix", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
  it("promotes values that round into the next unit", () => {
    expect(formatTokens(999_999)).toBe("1M");
    expect(formatTokens(999_999_999)).toBe("1B");
  });
  it("formats billions with B suffix", () => {
    expect(formatTokens(2_000_000_000)).toBe("2B");
  });
  it("returns N/A for null/undefined/non-finite", () => {
    expect(formatTokens(null, t({ notAvailable: "N/A" }))).toBe("N/A");
    expect(formatTokens(undefined, t({ notAvailable: "N/A" }))).toBe("N/A");
    expect(formatTokens(Number.NaN)).toBe("N/A");
  });
});

describe("formatScore", () => {
  it("returns N/A for null/undefined", () => {
    expect(formatScore(t({ notAvailable: "N/A" }), null)).toBe("N/A");
    expect(formatScore(t({ notAvailable: "N/A" }), undefined)).toBe("N/A");
  });
  it("formats number as string", () => {
    expect(formatScore(t(), 85)).toBe("85.00");
  });
});

describe("formatBoolean", () => {
  it("returns Yes/No for boolean", () => {
    const t1 = t({ yes: "Yes", no: "No" });
    expect(formatBoolean(t1, true)).toBe("Yes");
    expect(formatBoolean(t1, false)).toBe("No");
  });
  it("returns N/A for undefined", () => {
    expect(formatBoolean(t({ notAvailable: "N/A" }), undefined)).toBe("N/A");
  });
});

describe("formatShortNumber", () => {
  it("formats small numbers as-is", () => {
    expect(formatShortNumber(42)).toBe("42");
    expect(formatShortNumber(500)).toBe("500");
  });
  it("formats thousands with K suffix", () => {
    expect(formatShortNumber(1_500)).toBe("1.50K");
    expect(formatShortNumber(1234)).toBe("1.23K");
    expect(formatShortNumber(-2500)).toBe("-2.50K");
  });
  it("formats millions with M suffix", () => {
    expect(formatShortNumber(1_500_000)).toBe("1.50M");
  });
  it("promotes values that round into the next unit", () => {
    expect(formatShortNumber(999_999)).toBe("1.00M");
    expect(formatShortNumber(999_999_999_999)).toBe("1.00T");
  });
  it("formats billions with B suffix", () => {
    expect(formatShortNumber(2_000_000_000)).toBe("2.00B");
  });
  it("returns em dash for non-finite", () => {
    expect(formatShortNumber(NaN)).toBe("\u2014");
  });
});

describe("formatDate", () => {
  it("returns string for invalid date", () => {
    expect(formatDate("invalid", "en")).toBe("invalid");
  });
  it("formats a date string", () => {
    expect(formatDate("2024-01-15", "en")).toBe("1/15/2024");
  });
});

describe("benchmarkLabel", () => {
  it("returns translated label for known keys", () => {
    expect(benchmarkLabel("gpqa", t({ benchmarkGpqa: "GPQA" }))).toBe("GPQA");
  });
  it("returns key itself for unknown keys", () => {
    expect(benchmarkLabel("unknown", t())).toBe("unknown");
  });
});

describe("categoryLabel", () => {
  it("returns translated category label", () => {
    expect(categoryLabel("coding", t({ catCoding: "Coding", catReasoning: "Reasoning" }))).toBe("Coding");
    expect(categoryLabel("reasoning", t({ catCoding: "Coding", catReasoning: "Reasoning" }))).toBe("Reasoning");
  });
  it("returns catGeneral for unknown category", () => {
    expect(categoryLabel("unknown", t())).toBe("catGeneral");
  });
});

describe("formatTrend", () => {
  it("returns N/A for null/undefined", () => {
    expect(formatTrend(null, t({ notAvailable: "N/A" }))).toBe("N/A");
    expect(formatTrend(undefined)).toBe("N/A");
  });
  it("passes percentage points through with a sign and one decimal", () => {
    expect(formatTrend(5.5)).toBe("+5.5%");
    expect(formatTrend(47.8)).toBe("+47.8%");
    expect(formatTrend(0.8)).toBe("+0.8%");
  });
  it("formats negative change", () => {
    expect(formatTrend(-3.2)).toBe("-3.2%");
  });
  it("returns 0.0% for zero", () => {
    expect(formatTrend(0)).toBe("0.0%");
  });
});

describe("formatDollar", () => {
  it("formats dollar amount", () => {
    expect(formatDollar(42)).toBe("$42.00");
  });
  it("keeps tiny prices visible instead of rendering $0.00", () => {
    expect(formatDollar(0.004)).toBe("$0.004");
    expect(formatDollar(0.0001)).toBe("$0.0001");
  });
  it("keeps typical two-decimal formatting otherwise", () => {
    expect(formatDollar(3)).toBe("$3.00");
    expect(formatDollar(0.02)).toBe("$0.02");
    expect(formatDollar(0)).toBe("$0.00");
  });
  it("returns N/A for null/undefined", () => {
    expect(formatDollar(null, t({ notAvailable: "N/A" }))).toBe("N/A");
    expect(formatDollar(undefined, t({ notAvailable: "N/A" }))).toBe("N/A");
  });
});

describe("formatPricePerMillion", () => {
  it("formats price per million tokens", () => {
    expect(formatPricePerMillion(0.005)).toBe("$0.01/M tokens");
  });
  it("returns N/A for null/undefined", () => {
    expect(formatPricePerMillion(null, t({ notAvailable: "N/A" }))).toBe("N/A");
    expect(formatPricePerMillion(undefined, t({ notAvailable: "N/A" }))).toBe("N/A");
  });
});

describe("formatUptime", () => {
  it("returns days format for large values", () => {
    const t1 = t({ uptimeDays: "{days}d {hours}h" });
    expect(formatUptime(t1, 172_800_000)).toBe("2d 0h");
  });
  it("returns hours format for medium values", () => {
    const t1 = t({ uptimeHours: "{hours}h {mins}m" });
    expect(formatUptime(t1, 7_200_000)).toBe("2h 0m");
  });
  it("returns mins format for small values", () => {
    const t1 = t({ uptimeMins: "{mins}m" });
    expect(formatUptime(t1, 300_000)).toBe("5m");
  });
});

describe("formatRelativeTime", () => {
  it("returns just now for recent times", () => {
    const t1 = t({ timeJustNow: "just now" });
    const now = new Date().toISOString();
    expect(formatRelativeTime(now, t1)).toBe("just now");
  });
  it("returns past date string for invalid input", () => {
    expect(formatRelativeTime("invalid", t())).toBe("invalid");
  });
});

describe("safeHref", () => {
  it("allows internal paths and http(s) URLs", () => {
    expect(safeHref("/models?tab=x")).toBe("/models?tab=x");
    expect(safeHref("https://ok.example/a")).toBe("https://ok.example/a");
  });
  it("rejects protocol-relative and backslash-scheme-relative URLs", () => {
    expect(safeHref("//evil.example")).toBeUndefined();
    expect(safeHref("/\\evil.example")).toBeUndefined();
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
  });
});

function makeModel(over: Partial<ArtificialAnalysisModel>): ArtificialAnalysisModel {
  return { id: "m", slug: "m", name: "M", intelligence_index: null, ...over };
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

describe("calcMonthlyCost", () => {
  it("scales daily cost by days per month", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      cacheWriteRate: 0,
      daysPerMonth: 22,
    });
    expect(cost).toBe(3 * 22);
  });

  it("forwards reasoning and cache settings", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cacheHit: 1 } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 2_000_000,
      dailyOutput: 0,
      dailyReasoning: 1_000_000,
      cacheHitRate: 0.5,
      cacheWriteRate: 0,
      daysPerMonth: 22,
    });
    expect(cost).toBe(13 * 22);
  });

  it("clamps daysPerMonth to at least 1", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      cacheWriteRate: 0,
      daysPerMonth: 0,
    });
    expect(cost).toBe(3);
  });

  it("computes input and output cost from per-million prices", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: 0.1 } });
    expect(dailyCost(model, 1_000_000, 1_000_000)).toBe(3);
  });

  it("splits input between cached and uncached rates by cacheHitRate", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cacheHit: 1 } });
    expect(dailyCost(model, 2_000_000, 0, { cacheHitRate: 0.5 })).toBe(11);
  });

  it("falls back to input price when cacheHit is missing", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cacheHit: null } });
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: 1 })).toBe(10);
  });

  it("bills reasoning tokens at the output rate", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    expect(dailyCost(model, 1_000_000, 1_000_000, { dailyReasoning: 2_000_000 })).toBe(1 + 3 * 2);
  });

  it("clamps cacheHitRate to [0, 1]", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cacheHit: 1 } });
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: 5 })).toBe(1);
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: -1 })).toBe(10);
  });

  it("clamps negative token counts to zero", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    expect(dailyCost(model, -5, -5)).toBe(0);
  });

  it("returns null when pricing is missing", () => {
    expect(dailyCost(makeModel({}), 1_000_000, 1_000_000)).toBeNull();
  });

  it("returns null when input/output prices are missing", () => {
    expect(dailyCost(makeModel({ pricing: { cacheHit: 0.1 } }), 1_000_000, 1_000_000)).toBeNull();
  });

  it("returns null for non-finite tokens", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    expect(dailyCost(model, Number.NaN, 1_000_000)).toBeNull();
  });
});

describe("fuzzyMatch", () => {
  const items = [{ name: "claude-opus-4" }, { name: "gpt-5" }, { name: "deepseek-r1" }];
  const fields = (m: { name: string }) => [m.name];

  it("rescues typo queries the tiered matcher misses", () => {
    expect(matchTerm(["claude-opus-4"], "calude").matched).toBe(false);
    expect(fuzzyMatch(items, "calude", fields).map((m) => m.name)).toContain("claude-opus-4");
  });

  it("returns empty for short terms and empty input", () => {
    expect(fuzzyMatch(items, "gp", fields)).toEqual([]);
    expect(fuzzyMatch([], "claude", fields)).toEqual([]);
    expect(fuzzyMatch(items, "   ", fields)).toEqual([]);
  });

  it("returns empty when nothing is close", () => {
    expect(fuzzyMatch(items, "zzzqqq", fields)).toEqual([]);
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

  it("treats display-identical values as a tie with no highlighting", () => {
    const near: M[] = [
      { id: "x", score: 100, cost: null },
      { id: "y", score: 100.0000000001, cost: null },
    ];
    const rows: CompareRow<M>[] = [{ label: "score", getNumeric: (m) => m.score, bestIs: "max" }];
    const winners = computeWinners(rows, near, getKey);
    expect(winners.get("score")?.get("x")).toBeUndefined();
    expect(winners.get("score")?.get("y")).toBeUndefined();
  });

  it("still marks a winner when values differ beyond display precision", () => {
    const close: M[] = [
      { id: "x", score: 88.41, cost: null },
      { id: "y", score: 88.5, cost: null },
    ];
    const rows: CompareRow<M>[] = [{ label: "score", getNumeric: (m) => m.score, bestIs: "max", worstIs: "min" }];
    const winners = computeWinners(rows, close, getKey);
    expect(winners.get("score")?.get("y")).toBe("win");
    expect(winners.get("score")?.get("x")).toBe("loss");
  });

  it("skips rows without a direction or with fewer than two numeric values", () => {
    const rows: CompareRow<M>[] = [
      { label: "noDirection", getNumeric: (m) => m.score },
      { label: "noAccessor", bestIs: "max" },
      { label: "singleValue", getNumeric: (m) => (m.id === "a" ? 1 : null), bestIs: "min" },
    ];
    expect(computeWinners(rows, models, getKey).size).toBe(0);
  });

  it("does not highlight win/loss when every model ties", () => {
    const tied: M[] = [
      { id: "x", score: 88, cost: null },
      { id: "y", score: 88, cost: null },
    ];
    const rows: CompareRow<M>[] = [{ label: "score", getNumeric: (m) => m.score, bestIs: "max", worstIs: "min" }];
    const winners = computeWinners(rows, tied, getKey);
    expect(winners.get("score")?.get("x")).toBeUndefined();
    expect(winners.get("score")?.get("y")).toBeUndefined();
  });
});

const tKey = ((key: string): string => key) as unknown as TFunction;

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

describe("buildRadarData", () => {
  it("builds radar data for a single model", () => {
    const model = makeCompareModel();
    const data = buildRadarData(tKey, [model]);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ metric: "intelligence", model_0: 80 });
    expect(data[1]).toEqual({ metric: "coding", model_0: 70 });
    expect(data[2]).toEqual({ metric: "agentic", model_0: 60 });
    expect(data[3]).toEqual({ metric: "gpqa", model_0: 85 });
    expect(data[6]).toEqual({ metric: "ifbench", model_0: 88 });
  });

  it("builds radar data for multiple models", () => {
    const data = buildRadarData(tKey, [makeCompareModel(), makeCompareModel({ intelligence_index: 90 })]);
    expect(data[0]!.model_0).toBe(80);
    expect(data[0]!.model_1).toBe(90);
  });

  it("returns null for missing benchmarks", () => {
    const model = makeCompareModel({ benchmarks: {} });
    const data = buildRadarData(tKey, [model]);
    expect(data[3]!.model_0).toBeNull();
  });

  it("returns rows with only metric labels for empty models", () => {
    const data = buildRadarData(tKey, []);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ metric: "intelligence" });
  });
});

describe("radarMaxFor", () => {
  it("returns the fallback when data is empty or has no numeric values", () => {
    expect(radarMaxFor([])).toBe(100);
    expect(radarMaxFor([{ metric: "intelligence" }])).toBe(100);
    expect(radarMaxFor([{ metric: "intelligence", model_0: null }])).toBe(100);
  });

  it("ignores the metric label key and non-finite values", () => {
    expect(radarMaxFor([{ metric: 150, model_0: 80 }, { metric: "x", model_0: Infinity } as never])).toBe(100);
  });

  it("grows in 20-steps when data exceeds the fallback", () => {
    expect(radarMaxFor([{ metric: "x", model_0: 101 }])).toBe(120);
    expect(radarMaxFor([{ metric: "x", model_0: 120 }])).toBe(120);
    expect(radarMaxFor([{ metric: "x", model_0: 121 }])).toBe(140);
  });

  it("honors a custom fallback", () => {
    expect(radarMaxFor([{ metric: "x", model_0: 10 }], 20)).toBe(20);
  });
});

describe("buildCompareRows", () => {
  const metrics = buildCompareRows(tKey);

  it("includes score metrics with bestIs max", () => {
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex");
    expect(intelMetric).toBeDefined();
    expect(intelMetric?.bestIs).toBe("max");
  });

  it("includes percent metrics", () => {
    const gpqaMetric = metrics.find((m) => m.label === "gpqa");
    expect(gpqaMetric).toBeDefined();
    expect(gpqaMetric?.getNumeric?.(makeCompareModel())).toBe(85);
  });

  it("includes output speed metric", () => {
    const speedMetric = metrics.find((m) => m.label === "outputSpeed");
    expect(speedMetric).toBeDefined();
    expect(speedMetric?.bestIs).toBe("max");
  });

  it("includes open weights metric", () => {
    const owMetric = metrics.find((m) => m.label === "openWeights");
    expect(owMetric).toBeDefined();
  });

  it("computes getValue correctly", () => {
    const model = makeCompareModel();
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex")!;
    expect(intelMetric.getValue!(model)).toBe("80.00");
  });

  it("returns N/A for missing values", () => {
    const model = makeCompareModel({ intelligence_index: null });
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex")!;
    expect(intelMetric.getValue!(model)).toBe("notAvailable");
  });
});

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

describe("official price resolution", () => {
  const official = makeOfficial({});
  const index = indexOfficialPricing([official]);
  it("matches parenthesized catalog variant names to clean official ids", () => {
    const hit = matchOfficialPricing(index, makeModel({ name: "GPT-5 (Reasoning, High Effort)" }));
    expect(hit?.id).toBe("gpt-5");
  });
  it("returns undefined without a match", () => {
    expect(matchOfficialPricing(index, makeModel({ name: "Some Other Model" }))).toBeUndefined();
  });
  it("official legs win per-leg, catalog fills the gaps", () => {
    const eff = resolveEffectivePricing({ input: 10, output: 50, cacheHit: 1 }, makeOfficial({ output: null }));
    expect(eff).toEqual({ input: 5, output: 50, cacheHit: 0.5, cacheWrite: 6.25, source: "official" });
  });
  it("falls back to catalog without an official match", () => {
    const eff = resolveEffectivePricing({ input: 10, output: 50, cacheHit: 1 });
    expect(eff).toEqual({ input: 10, output: 50, cacheHit: 1, cacheWrite: null, source: "catalog" });
  });
  it("fills the write leg from the catalog when the official match lacks one", () => {
    const eff = resolveEffectivePricing(
      { input: 10, output: 50, cacheHit: 1, cacheWrite: 12.5 },
      makeOfficial({ cacheWrite: null }),
    );
    expect(eff).toEqual({ input: 5, output: 25, cacheHit: 0.5, cacheWrite: 12.5, source: "official" });
  });
  it("reports a null source when no leg resolves", () => {
    expect(resolveEffectivePricing(undefined, null).source).toBeNull();
  });
  it("recomputes blended from official legs", () => {
    const model = makeModel({ pricing: { input: 10, output: 50, cacheHit: 1 } });
    expect(resolveBlendedPrice(model, official)).toBeCloseTo(3.85, 5);
  });
  it("computes blended from catalog legs without an official match", () => {
    const model = makeModel({ pricing: { input: 5, output: 25, cacheHit: 0.5 } });
    expect(resolveBlendedPrice(model)).toBeCloseTo(3.85, 5);
  });
  it("monthly cost uses official legs when matched", () => {
    const model = makeModel({ pricing: { input: 10, output: 50, cacheHit: null } });
    const opts = {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      cacheWriteRate: 0,
      daysPerMonth: 1,
    };
    expect(calcMonthlyCost(model, opts)).toBe(60);
    expect(calcMonthlyCost(model, opts, official)).toBe(30);
  });
  it("monthly cost bills cache-write tokens at the write tier", () => {
    const model = makeModel({ pricing: { input: 10, output: 0, cacheHit: 1, cacheWrite: 30 } });
    const opts = {
      dailyInput: 1_000_000,
      dailyOutput: 0,
      cacheHitRate: 0.5,
      cacheWriteRate: 0.2,
      daysPerMonth: 1,
    };
    expect(calcMonthlyCost(model, opts)).toBeCloseTo(0.5 * 1 + 0.2 * 30 + 0.3 * 10, 5);
  });
  it("monthly cost ignores the write rate when the interface has no write price", () => {
    const model = makeModel({ pricing: { input: 10, output: 0, cacheHit: 1 } });
    const opts = {
      dailyInput: 1_000_000,
      dailyOutput: 0,
      cacheHitRate: 0.5,
      cacheWriteRate: 0.2,
      daysPerMonth: 1,
    };
    expect(calcMonthlyCost(model, opts)).toBeCloseTo(0.5 * 1 + 0.5 * 10, 5);
  });
});

describe("monthly cost default fast path", () => {
  const defaultCalc = { input: 2, output: 1, reasoning: 2, cache: 0.5, cacheWrite: 0.05, days: 22 };

  it("reuses the server precomputed default when no official pricing is loaded", () => {
    const model = makeModel({ defaultMonthlyCost: 123 });
    expect(getCachedMonthlyCost(model, defaultCalc, undefined)).toBe(123);
  });

  it("keeps the precomputed default when official pricing is loaded but the model is unmatched", () => {
    const model = makeModel({ defaultMonthlyCost: 123 });
    expect(getCachedMonthlyCost(model, defaultCalc, makeOfficialGetter([makeOfficial({})]))).toBe(123);
  });

  it("recomputes from official legs when an official price matches", () => {
    const model = makeModel({
      name: "GPT-5",
      defaultMonthlyCost: 123,
      pricing: { input: 10, output: 50, cacheHit: null },
    });
    expect(getCachedMonthlyCost(model, defaultCalc, makeOfficialGetter([makeOfficial({})]))).toBeCloseTo(1773.75, 5);
  });
});

describe("useMonthlyCosts", () => {
  it("recomputes monthly costs when official pricing arrives after mount", () => {
    const models = [makeModel({ name: "GPT-5", pricing: { input: 10, output: 50, cacheHit: null } })];
    const { result, rerender } = renderHook(({ getOfficial }) => useMonthlyCosts(models, getOfficial), {
      initialProps: { getOfficial: undefined as OfficialGetter | undefined },
    });
    expect(result.current.monthlyCosts[0]).toBe(3740);
    rerender({ getOfficial: makeOfficialGetter([makeOfficial({})]) });
    expect(result.current.monthlyCosts[0]).toBeCloseTo(1773.75, 5);
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
  it("folds the long tail beyond the slice limit into other", () => {
    const models = ["a", "b", "c", "d", "e", "f", "g"].map((t) => task(t));
    const { slices, total } = aggregateTaskShare(models);
    expect(slices).toHaveLength(6);
    expect(slices[5]).toEqual({ key: "__other__", total: 2 });
    expect(total).toBe(7);
  });
  it("returns empty slices for empty input", () => {
    expect(aggregateTaskShare([])).toEqual({ slices: [], total: 0 });
  });
  it("resolves localized labels with English fallback", () => {
    const t = (key: string) => (key === "taskTextGeneration" ? "文本生成" : key);
    expect(taskLabel("text-generation", t)).toBe("文本生成");
    expect(taskLabel("some-new-task", t)).toBe("Some New Task");
    expect(formatTaskLabel("automatic_speech_recognition")).toBe("Automatic Speech Recognition");
  });
});

describe("pickLatestReleaseName", () => {
  const closed = (releaseDate: string, model = "Closed Model"): ClosedReleaseEntry => ({
    id: model,
    model,
    provider: "Lab",
    releaseDate,
    link: "https://example.com",
  });
  it("returns the head of the 模型发布 feed", () => {
    expect(pickLatestReleaseName([closed("2026-09-05"), closed("2026-09-01")])).toBe("Closed Model");
  });
  it("returns null when the feed is empty or dateless", () => {
    expect(pickLatestReleaseName([])).toBeNull();
    expect(pickLatestReleaseName([closed("not-a-date")])).toBeNull();
  });
});

describe("resolveInitialTab", () => {
  const tabs = ["feed", "closed"] as const;
  it("accepts a valid deep-link param", () => {
    expect(resolveInitialTab(tabs, "closed", "feed")).toBe("closed");
  });
  it("falls back for missing or unknown params", () => {
    expect(resolveInitialTab(tabs, null, "feed")).toBe("feed");
    expect(resolveInitialTab(tabs, "nope", "feed")).toBe("feed");
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

describe("isIosDevice", () => {
  it("detects iPhone and iPad user agents", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe(true);
  });
  it("detects iPadOS 13+ masquerading as Macintosh with touch", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5)).toBe(true);
  });
  it("rejects desktop Macs without touch and Android devices", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});

describe("isStandaloneMode", () => {
  it("is true for iOS standalone or any display-mode match", () => {
    expect(isStandaloneMode({ navigatorStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayFullscreen: true })).toBe(true);
  });
  it("is false for regular browser tabs", () => {
    expect(isStandaloneMode({})).toBe(false);
    expect(isStandaloneMode({ navigatorStandalone: false, displayStandalone: false, displayFullscreen: false })).toBe(
      false,
    );
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

  it("is a no-op without a window", () => {
    expect(() => unregisterStaleServiceWorker()).not.toThrow();
  });
});

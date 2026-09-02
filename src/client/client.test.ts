import { describe, expect, it } from "vitest";
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
} from "@/client/utils/format";
import { calcMonthlyCost } from "@/client/utils/model";
import { matchTerm } from "@/client/search/useSearchAllRankings";
import { buildCompareRows, buildRadarData, computeWinners, type CompareRow } from "@/client/features/compare/logic";
import { createT, interpolate } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

// Consolidated client tests: display formatters, cost estimation, search term
// matching, compare feature logic and the i18n interpolation core.

// -- shared test doubles -----------------------------------------------------------

const t = (overrides: Record<string, string> = {}): TFunction => {
  return ((key: string, params?: Record<string, unknown>) => {
    const val = overrides[key] ?? key;
    if (!params) return val;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val);
  }) as unknown as TFunction;
};

// -- formatters -----------------------------------------------------------------

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

// -- cost estimation --------------------------------------------------------------

function makeModel(over: Partial<ArtificialAnalysisModel>): ArtificialAnalysisModel {
  return { id: "m", slug: "m", name: "M", intelligence_index: null, ...over };
}

// daysPerMonth: 1 makes calcMonthlyCost return the single-day cost.
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
    daysPerMonth: 1,
  });
}

describe("calcMonthlyCost", () => {
  it("scales daily cost by days per month", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: null } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      daysPerMonth: 22,
    });
    expect(cost).toBe(3 * 22);
  });

  it("forwards reasoning and cache settings", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cache_hit: 1 } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 2_000_000,
      dailyOutput: 0,
      dailyReasoning: 1_000_000,
      cacheHitRate: 0.5,
      daysPerMonth: 22,
    });
    expect(cost).toBe(13 * 22);
  });

  it("clamps daysPerMonth to at least 1", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: null } });
    const cost = calcMonthlyCost(model, {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      daysPerMonth: 0,
    });
    expect(cost).toBe(3);
  });

  it("computes input and output cost from per-million prices", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: 0.1 } });
    expect(dailyCost(model, 1_000_000, 1_000_000)).toBe(3);
  });

  it("splits input between cached and uncached rates by cacheHitRate", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cache_hit: 1 } });
    expect(dailyCost(model, 2_000_000, 0, { cacheHitRate: 0.5 })).toBe(11);
  });

  it("falls back to input price when cache_hit is missing", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cache_hit: null } });
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: 1 })).toBe(10);
  });

  it("bills reasoning tokens at the output rate", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: null } });
    expect(dailyCost(model, 1_000_000, 1_000_000, { dailyReasoning: 2_000_000 })).toBe(1 + 3 * 2);
  });

  it("clamps cacheHitRate to [0, 1]", () => {
    const model = makeModel({ pricing: { input: 10, output: 2, cache_hit: 1 } });
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: 5 })).toBe(1);
    expect(dailyCost(model, 1_000_000, 0, { cacheHitRate: -1 })).toBe(10);
  });

  it("clamps negative token counts to zero", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: null } });
    expect(dailyCost(model, -5, -5)).toBe(0);
  });

  it("returns null when pricing is missing", () => {
    expect(dailyCost(makeModel({}), 1_000_000, 1_000_000)).toBeNull();
  });

  it("returns null when input/output prices are missing", () => {
    expect(dailyCost(makeModel({ pricing: { cache_hit: 0.1 } }), 1_000_000, 1_000_000)).toBeNull();
  });

  it("returns null for non-finite tokens", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cache_hit: null } });
    expect(dailyCost(model, Number.NaN, 1_000_000)).toBeNull();
  });
});

// -- search -----------------------------------------------------------------------

describe("matchTerm", () => {
  it("scores exact matches highest", () => {
    const { matched, score } = matchTerm(["gpt-5"], "gpt-5");
    expect(matched).toBe(true);
    expect(score).toBe(4);
  });

  it("scores prefix matches above substring matches", () => {
    expect(matchTerm(["gpt-5", "claude"], "gpt").score).toBe(3);
    expect(matchTerm(["my-gpt-5", "claude"], "gpt").score).toBe(2);
  });

  it("matches any field", () => {
    expect(matchTerm(["openai", "gpt-5-mini"], "mini").matched).toBe(true);
  });

  it("returns unmatched for empty fields", () => {
    expect(matchTerm(["", " "], "gpt").matched).toBe(false);
  });

  it("requires a non-empty term to match", () => {
    expect(matchTerm(["gpt-5"], "zzz").matched).toBe(false);
  });
});

// -- compare feature logic ----------------------------------------------------------

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

describe("buildCompareRows", () => {
  const metrics = buildCompareRows(tKey);

  it("includes all expected metrics", () => {
    expect(metrics.length).toBeGreaterThan(5);
  });

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

// -- i18n ----------------------------------------------------------------------------

describe("interpolate", () => {
  it("replaces named placeholders with provided params", () => {
    expect(interpolate("{value} min ago", { value: 5 })).toBe("5 min ago");
    expect(interpolate("{a} + {b}", { a: 1, b: "x" })).toBe("1 + x");
  });

  it("leaves placeholders untouched when their param is missing or null", () => {
    expect(interpolate("hello {name}")).toBe("hello {name}");
    expect(interpolate("hello {name}", {})).toBe("hello {name}");
    expect(interpolate("hello {name}", { name: null as unknown as string })).toBe("hello {name}");
  });

  it("returns the template as-is when no params are given", () => {
    expect(interpolate("plain {text}")).toBe("plain {text}");
  });
});

describe("createT", () => {
  it("translates with the requested language dictionary", () => {
    const zh = createT("zh");
    expect(zh("compareLimit")).toBe("请至少选择 2 个模型进行对比。");
    const en = createT("en");
    expect(en("compareLimit")).toBe("Select at least 2 models to compare.");
  });

  it("interpolates params into translated templates", () => {
    const en = createT("en");
    expect(en("timeMinutesAgo", { value: 3 })).toMatch(/^3/);
  });

  it("falls back to the key name for unknown keys", () => {
    const zh = createT("zh");
    expect(zh("definitelyNotAKey" as never)).toBe("definitelyNotAKey");
  });
});

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
} from "./format";
import { calcMonthlyCost } from "./model";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

// Consolidated tests for the app utils layer: display formatters and cost estimation.

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

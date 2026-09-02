import { describe, expect, it } from "vitest";
import { buildCompareRows, buildRadarData, computeWinners, type CompareRow } from "./logic";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

// Tests for the compare feature's metric/winner logic.

// -- compare --------------------------------------------------------------------

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

const t = ((key: string): string => key) as unknown as TFunction;

function makeModel(over: Partial<ArtificialAnalysisModel> = {}): ArtificialAnalysisModel {
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
    const model = makeModel();
    const data = buildRadarData(t, [model]);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ metric: "intelligence", model_0: 80 });
    expect(data[1]).toEqual({ metric: "coding", model_0: 70 });
    expect(data[2]).toEqual({ metric: "agentic", model_0: 60 });
    expect(data[3]).toEqual({ metric: "gpqa", model_0: 85 });
    expect(data[6]).toEqual({ metric: "ifbench", model_0: 88 });
  });

  it("builds radar data for multiple models", () => {
    const data = buildRadarData(t, [makeModel(), makeModel({ intelligence_index: 90 })]);
    expect(data[0]!.model_0).toBe(80);
    expect(data[0]!.model_1).toBe(90);
  });

  it("returns null for missing benchmarks", () => {
    const model = makeModel({ benchmarks: {} });
    const data = buildRadarData(t, [model]);
    expect(data[3]!.model_0).toBeNull();
  });

  it("returns rows with only metric labels for empty models", () => {
    const data = buildRadarData(t, []);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ metric: "intelligence" });
  });
});

describe("buildCompareRows", () => {
  const metrics = buildCompareRows(t);

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
    expect(gpqaMetric?.getNumeric?.(makeModel())).toBe(85);
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
    const model = makeModel();
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex")!;
    expect(intelMetric.getValue!(model)).toBe("80.00");
  });

  it("returns N/A for missing values", () => {
    const model = makeModel({ intelligence_index: null });
    const intelMetric = metrics.find((m) => m.label === "intelligenceIndex")!;
    expect(intelMetric.getValue!(model)).toBe("notAvailable");
  });
});

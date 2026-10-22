import { describe, expect, it } from "vitest";
import type { MetaLookup, RankingScanStats } from "./aggregate";
import { mapModels } from "./parse-rankings";

const row = (id: string) => ({
  model_permaslug: id,
  date: "2026-01-01",
  total_prompt_tokens: 10,
  total_completion_tokens: 5,
  count: 1,
});

const emptyStats = (): RankingScanStats => ({ scannedRows: 0, validRows: 0, expiredRows: 0 });

const metaWith = (entries: Record<string, { expiresAt: string }>) => entries as unknown as MetaLookup;

describe("mapModels retirement accounting", () => {
  it("drops retired models and counts them apart from the valid rows", () => {
    const stats = emptyStats();
    const models = mapModels(
      [row("old-model"), row("live-model")],
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
    const models = mapModels([row("live-model")], {}, stats, metaWith({}));

    expect(models).toHaveLength(1);
    expect(stats.expiredRows).toBe(0);
  });

  it("keeps ranking positions contiguous after a model is dropped", () => {
    const models = mapModels(
      [row("old-model"), row("live-model"), row("other-model")],
      {},
      emptyStats(),
      metaWith({ "old-model": { expiresAt: "2020-01-01" } }),
    );

    expect(models.map((model) => model.rank)).toEqual([1, 2]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
import type { ArtificialAnalysisModel } from "@/shared/types";

vi.mock("@/server/sources/aa/intelligence-index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/intelligence-index")>();
  return { ...mod, getIntelligenceIndexResult: vi.fn() };
});
vi.mock("@/server/sources/aa/changelog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/changelog")>();
  return { ...mod, getChangelogModels: vi.fn() };
});

import { getIntelligenceIndexResult } from "@/server/sources/aa/intelligence-index";
import { getChangelogModels } from "@/server/sources/aa/changelog";
import { getClosedReleases } from "@/server/sources/closed-releases";

const closedModel = (id: string): ArtificialAnalysisModel => ({
  id,
  slug: id,
  name: `Model ${id}`,
  intelligence_index: 42,
  is_open_weights: false,
  model_creators: { name: "Vendor", color: "#000" },
  release_date: "2026-01-02",
});

const indexResult = (models: ArtificialAnalysisModel[], enrichFailed = false) => ({
  models,
  weights: {},
  enrichFailed,
  fetchedAt: new Date().toISOString(),
});

describe("getClosedReleases", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("falls back to the index when the changelog leg rejects", async () => {
    // The regression: Promise.all rejected on the first failure, so a healthy
    // index plus a broken changelog returned 502 instead of using the fallback.
    vi.mocked(getChangelogModels).mockRejectedValue(new Error("markup changed"));
    vi.mocked(getIntelligenceIndexResult).mockResolvedValue(indexResult([closedModel("vendor/a")]));
    const { ctx } = testCtx();

    const payload = await getClosedReleases(ctx);

    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.id).toBe("vendor/a");
  });

  it("still 502s when both legs fail", async () => {
    vi.mocked(getChangelogModels).mockRejectedValue(new Error("changelog down"));
    vi.mocked(getIntelligenceIndexResult).mockRejectedValue(new Error("index down"));
    const { ctx } = testCtx();

    await expect(getClosedReleases(ctx)).rejects.toThrow(/both index and changelog failed/);
  });

  it("marks the payload partial when the index leg is the one that broke", async () => {
    vi.mocked(getIntelligenceIndexResult).mockRejectedValue(new Error("index down"));
    vi.mocked(getChangelogModels).mockResolvedValue([
      {
        name: "Model X",
        slug: "model-x",
        releaseName: "Model X",
        releaseSlug: "model-x",
        creatorName: "Vendor",
        releaseDate: "2026-02-03",
      },
    ]);
    const { ctx } = testCtx();

    const payload = await getClosedReleases(ctx);

    expect(payload.data).toHaveLength(1);
    expect(payload.partial).toBe(true);
  });
});

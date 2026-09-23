import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { testCtx } from "@/server/test-helpers";
import { ClientAbortError } from "@/server/infra/errors";
import type { ArtificialAnalysisModel } from "@/shared/types";

vi.mock("@/server/sources/aa/index-source", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/index-source")>();
  return { ...mod, getIntelligenceIndexResult: vi.fn() };
});
vi.mock("@/server/sources/aa/changelog-source", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/sources/aa/changelog-source")>();
  return { ...mod, getChangelogModels: vi.fn() };
});

import { getIntelligenceIndexResult } from "@/server/sources/aa/index-source";
import { getChangelogModels } from "@/server/sources/aa/changelog-source";
import { getClosedReleases } from "@/server/sources/closed-releases-source";

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
  enrichFailed,
  fetchedAt: new Date().toISOString(),
});

describe("getClosedReleases", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("falls back to the index when the changelog leg rejects", async () => {
    vi.mocked(getChangelogModels).mockRejectedValue(new Error("markup changed"));
    vi.mocked(getIntelligenceIndexResult).mockResolvedValue(indexResult([closedModel("vendor/a")]));
    const { ctx } = testCtx();

    const payload = await getClosedReleases(ctx);

    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.id).toBe("vendor/a");
    expect(payload.partial).toBe(true);
  });

  it("still 502s when both legs fail", async () => {
    vi.mocked(getChangelogModels).mockRejectedValue(new Error("changelog down"));
    vi.mocked(getIntelligenceIndexResult).mockRejectedValue(new Error("index down"));
    const { ctx } = testCtx();

    await expect(getClosedReleases(ctx)).rejects.toThrow(/both index and changelog failed/);
  });

  it("rethrows a caller abort when both legs were aborted", async () => {
    vi.mocked(getChangelogModels).mockRejectedValue(new ClientAbortError("caller gone"));
    vi.mocked(getIntelligenceIndexResult).mockRejectedValue(new ClientAbortError("caller gone"));
    const { ctx } = testCtx();

    await expect(getClosedReleases(ctx)).rejects.toBeInstanceOf(ClientAbortError);
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

import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { getModels, getModelById, getReleases, fetchHFModelById } from "@/server/sources/hf-source";
import { UpstreamError } from "@/server/infra/errors";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import type { AppContext } from "@/server/context";

beforeEach(() => resetModuleCachesForTests());

function hfCtx(items: unknown[], kvStore = new Map<string, string>()) {
  return testCtx(kvStore, {
    version: "v1",
    http: fakeHttp({ json: () => items }),
  });
}

describe("getModels empty-result TTL", () => {
  it("throws on empty results so stale cache is served instead of poisoning the key", async () => {
    const { ctx } = hfCtx([]);
    await expect(getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 })).rejects.toThrow(
      "0 usable models",
    );
  });

  it("excludes rows without an open license, like releases do", async () => {
    const { ctx } = hfCtx([
      { id: "org/open", downloads: 10, likes: 1, tags: ["license:mit"] },
      { id: "org/closed", downloads: 99, likes: 9, tags: ["license:proprietary"] },
      { id: "org/unknown", downloads: 50, likes: 5, tags: [] },
    ]);
    const { data: models } = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 });
    expect(models.map((m) => m.id)).toEqual(["org/open"]);
  });

  it("caches the full bucket payload so sibling limits never poison each other", async () => {
    const items = Array.from({ length: 600 }, (_, i) => ({
      id: `org/model-${i}`,
      downloads: 600 - i,
      likes: 1,
      tags: ["license:mit"],
    }));
    const { ctx, kvStore } = testCtx(new Map<string, string>(), {
      version: "v1",
      http: fakeHttp({ json: () => items }),
    });

    const first = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 101 });
    expect(first.data).toHaveLength(101);
    expect(first.fetchedAt).toBeDefined();

    const cachedRaw = JSON.parse(kvStore.get("v1:open-source-models:trendingScore:-1:200")!) as {
      d: { id: string }[] | { data: { id: string }[]; fetchedAt: string };
    };
    const cachedData = Array.isArray(cachedRaw.d) ? cachedRaw.d : (cachedRaw.d as { data: { id: string }[] }).data;
    expect(cachedData).toHaveLength(600);

    expect((await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 150 })).data).toHaveLength(150);
    expect((await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 })).data).toHaveLength(500);
  });
});

describe("list rows drop the detail-only tags", () => {
  const row = {
    id: "org/open",
    author: "org",
    downloads: 10,
    likes: 1,
    pipeline_tag: "text-generation",
    createdAt: "2026-01-01T00:00:00Z",
    lastModified: "2026-02-01T00:00:00Z",
    tags: ["license:mit", "text-generation"],
  };

  it("omits tags from both list endpoints", async () => {
    const { data: models } = await getModels(hfCtx([row]).ctx, {
      sort: "trendingScore",
      direction: "-1",
      limit: 500,
    });
    expect(models).toHaveLength(1);
    expect(models[0]).not.toHaveProperty("tags");
    expect(models[0]?.license).toBe("mit");

    const { data: releases } = await getReleases(hfCtx([row]).ctx);
    expect(releases).toHaveLength(1);
    expect(releases[0]).not.toHaveProperty("tags");
  });

  it("keeps tags on the by-id detail row the model page fetches", async () => {
    const { ctx } = testCtx(new Map(), {
      version: "v-hf-detail",
      http: fakeHttp({ json: () => row }),
    });
    await expect(fetchHFModelById(ctx, "org/open")).resolves.toMatchObject({
      id: "org/open",
      tags: ["license:mit", "text-generation"],
    });
  });
});

describe("fetchHFModelById / getModelById (window-free detail lookup)", () => {
  const hfRow = {
    id: "org/niche-model",
    author: "org",
    downloads: 3,
    likes: 0,
    pipeline_tag: "text-generation",
    createdAt: "2026-01-01T00:00:00Z",
    lastModified: "2026-02-01T00:00:00Z",
    tags: ["license:mit"],
  };
  const byIdCtx = (json: (url: string) => Promise<unknown>): AppContext =>
    testCtx(new Map(), {
      version: "v-hf-by-id",
      http: fakeHttp({ json }),
    }).ctx;

  it("maps a single upstream row without any list window", async () => {
    const ctx = byIdCtx(async (url: string) => {
      expect(url).toContain("/org/niche-model");
      return hfRow;
    });
    await expect(fetchHFModelById(ctx, "org/niche-model")).resolves.toMatchObject({
      id: "org/niche-model",
      license: "mit",
    });
    await expect(getModelById(ctx, "org/niche-model")).resolves.toMatchObject({
      data: { id: "org/niche-model" },
    });
  });

  it("resolves upstream 404 to null instead of a 502", async () => {
    const ctx = byIdCtx(async () => {
      throw new UpstreamError("HTTP 404 for https://huggingface.co/api/models/org/gone", { status: 404 });
    });
    await expect(fetchHFModelById(ctx, "org/gone")).resolves.toBeNull();
  });

  it("rejects malformed ids without touching the network", async () => {
    const ctx = byIdCtx(async () => {
      throw new Error("must not fetch");
    });
    await expect(fetchHFModelById(ctx, "   ")).rejects.toThrow(/Invalid Hugging Face model id/);
  });
});

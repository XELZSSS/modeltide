/** Vitest hoists `vi.mock()` per module graph: the wiring stays per test file. */
const FETCHED_AT = "2026-01-01T00:00:00.000Z";

export function openRouterRankingsPayload() {
  return {
    data: [
      {
        rank: 1,
        id: "a/b",
        name: "B",
        creator: "A",
        category: "general",
        totalTokens: 100,
      } as never,
    ],
    fetchedAt: FETCHED_AT,
  };
}

export function hfModelsPayload() {
  return {
    data: [
      {
        id: "a/b",
        author: "a",
        downloads: 1,
        likes: 1,
        license: null,
        task: null,
        createdAt: null,
        lastModified: null,
        tags: [],
      },
    ],
    fetchedAt: FETCHED_AT,
  };
}

export function textToImagePayload() {
  return {
    data: [],
    partial: true,
    fetchedAt: FETCHED_AT,
  };
}

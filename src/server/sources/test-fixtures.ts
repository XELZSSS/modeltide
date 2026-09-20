/**
 * Shared "healthy shape" payloads for the composed home-dashboard test. The
 * `vi.mock()` wiring stays per test file (vitest hoists mocks per module
 * graph); only the data lives here so the fixture can't drift from what
 * src/server/sources/home.ts fans in.
 */
export const FETCHED_AT = "2026-01-01T00:00:00.000Z";

export function openRouterRankingsPayload() {
  return {
    tokenUsageRankings: [
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

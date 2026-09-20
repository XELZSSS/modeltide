/**
 * Shared mock payloads for server source tests (home.test.ts,
 * contracts.test.ts). The `vi.mock()` wiring stays per test file (vitest
 * hoists mocks per module graph); only the payload data is centralized here
 * so healthy-shape fixtures can't drift between files.
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

export function modelDirectoryPayload() {
  return {
    pricing: { "a/b": { input: 1, output: 2, cacheHit: null, cacheWrite: null } },
    meta: {},
  };
}

export function intelligenceIndexPayload() {
  return {
    models: [
      {
        id: "a",
        slug: "a",
        name: "A",
        intelligence_index: 80,
        pricing: { input: 1, output: 2 },
      } as never,
    ],
    weights: {},
    enrichFailed: false,
  };
}

export function agentRankingsPayload() {
  return {
    entries: [{ rank: 1, id: "x", name: "X", creator: "C", score: 1.5, ciLower: 0, ciUpper: 3, license: null }],
    fetchedAt: FETCHED_AT,
  };
}

export function changelogModelsPayload() {
  return [
    {
      slug: "s",
      name: "N",
      releaseSlug: "r",
      releaseName: "R",
      releaseDate: "2026-01-01",
      creatorName: "C",
    },
  ];
}

export function officialPricingPayload() {
  return {
    models: [{ id: "a", name: "A", provider: "P", input: 1, output: 2, cachedInput: null, cacheWrite: null }],
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

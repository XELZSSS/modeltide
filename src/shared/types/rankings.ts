export type OpenRouterCategory = "coding" | "reasoning" | "general";

export interface OpenRouterRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  category: OpenRouterCategory;
  variant?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  requestCount?: number;
  imageOutputRequests?: number;
  videoOutputSeconds?: number;
  change?: number | null;
  pricing?: {
    input: number;
    output: number;
    cacheHit?: number;
  };
  isFree?: boolean;
}

export interface OpenRouterRankingsPayload {
  tokenUsageRankings: OpenRouterRankEntry[];
  fetchedAt: string;
}

export interface OpenSourceModelEntry {
  id: string;
  author: string | null;
  downloads: number;
  likes: number;
  license: string | null;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  tags: string[];
}

export interface ArenaRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  score: number | null;
  votes: number | null;
  preliminary: boolean;
  priceInput: number | null;
  priceOutput: number | null;
  contextTokens: number | null;
}

export interface ArenaRankingsPayload {
  entries: ArenaRankEntry[];
  fetchedAt: string;
}

export interface ArenaBoardPayload {
  category: string;
  entries: ArenaRankEntry[];
  fetchedAt: string;
}

export interface ClosedReleaseEntry {
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  notes: string;
  link: string | null;
}

export interface OfficialPriceModel {
  id: string;
  name: string;
  provider: string;
  input: number | null;
  cachedInput: number | null;
  output: number | null;
  contextWindow: number | null;
}

export interface OfficialPricingPayload {
  models: OfficialPriceModel[];
  fetchedAt: string;
}

export interface HallucinationRankingEntry {
  id: string;
  slug: string;
  model: string;
  hallucinationRate: number | null;
  accuracy: number | null;
  attemptRate: number | null;
  omniscienceIndex: number;
}

type OpenRouterCategory = "coding" | "reasoning" | "general";

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
  cachedTokens?: number;
  toolCalls?: number;
  requestCount?: number;
  change?: number | null;
  pricing?: {
    input: number;
    output: number;
    cacheHit?: number | null;
    cacheWrite?: number | null;
  };
  isFree?: boolean;
}

export interface OpenRouterRankingsPayload {
  tokenUsageRankings: OpenRouterRankEntry[];
  fetchedAt: string;
  /** True when the pricing directory was empty and rankings ship without prices. */
  partial?: boolean;
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

export interface AgentRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  score: number | null;
  ciLower: number | null;
  ciUpper: number | null;
  license: string | null;
}

export interface AgentRankingsPayload {
  entries: AgentRankEntry[];
  fetchedAt: string;
}

export interface ClosedReleaseEntry {
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  link: string | null;
}

export interface OfficialPriceModel {
  id: string;
  name: string;
  provider: string;
  input: number | null;
  cachedInput: number | null;
  cacheWrite: number | null;
  output: number | null;
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

import type { ModelPricing } from "./catalog";

type OpenRouterCategory = "coding" | "reasoning" | "general";

export interface OpenRouterRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  category: OpenRouterCategory;
  variant: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  toolCalls: number;
  requestCount: number;
  change: number | null;
  pricing: ModelPricing | null;
  isFree: boolean;
  /** ISO date upstream retires this model; null when no retirement is scheduled. */
  expiresAt: string | null;
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

export interface ClosedReleaseEntry {
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  link: string | null;
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

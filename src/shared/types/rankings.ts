import type { ModelPricing } from "./catalog";

type OpenRouterCategory = "coding" | "reasoning" | "general";

export interface OpenRouterRankEntry {
  id: string;
  name: string;
  creator: string;
  category: OpenRouterCategory;
  variant: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  change: number | null;
  pricing: ModelPricing | null;
  isFree: boolean;
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
  /**
   * The Artificial Analysis slug this release is identified by. Its *space* depends on which source produced the entry:
   * the changelog path carries AA's **release** slug (`releaseSlug`), while the index fallback has no release slug and
   * uses the **model** slug instead. Only one path ever runs for a given payload, and the two must not be assumed
   * interchangeable — an id from one list will not look up in the other.
   */
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  /** The model page this release belongs to, or `null` when the source offered no usable model slug. */
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

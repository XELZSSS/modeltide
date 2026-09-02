/** Usage-based ranking categories from OpenRouter. */
type OpenRouterCategory = "coding" | "reasoning" | "general";

/** A model row in the OpenRouter usage rankings. */
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
    prompt: number;
    completion: number;
    input_cache_read?: number;
  };
  isFree?: boolean;
}

/** Wrapper for the OpenRouter usage-rankings response. */
export interface OpenRouterRankingsPayload {
  tokenUsageRankings: OpenRouterRankEntry[];
  fetchedAt: string;
}

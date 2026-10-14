import { OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";

export const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
export const SORT_DIRECTIONS = ["-1"] as const;

export interface OpenSourceModelsQuery {
  sort: string;
  direction: string;
}

export function openSourceModelsQueryString(q: Partial<OpenSourceModelsQuery> = {}): Record<string, string> {
  return {
    sort: q.sort ?? OPEN_SOURCE_MODELS_DEFAULTS.sort,
    direction: q.direction ?? OPEN_SOURCE_MODELS_DEFAULTS.direction,
  };
}

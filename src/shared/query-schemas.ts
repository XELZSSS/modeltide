export const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;

export interface OpenSourceModelsQuery {
  sort: string;
}

export function openSourceModelsQueryString(sort: string): Record<string, string> {
  return { sort };
}

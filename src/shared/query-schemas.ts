export const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;

export interface OpenSourceModelsQuery {
  sort: string;
  id?: string;
}

export function openSourceModelsQueryString(sort: string, id?: string): Record<string, string> {
  return id ? { sort, id } : { sort };
}

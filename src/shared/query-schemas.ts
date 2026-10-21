export const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;

export interface OpenSourceModelsQuery {
  sort: string;
  /** Present only for single-model lookups on the list endpoint. */
  id?: string;
}

export function openSourceModelsQueryString(sort: string, id?: string): Record<string, string> {
  return id ? { sort, id } : { sort };
}

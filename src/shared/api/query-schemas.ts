import { MAX_NAME_CHARS, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";
import { NEWS_CATEGORIES as NEWS_CATS } from "@/shared/types/news";

export const OPEN_SOURCE_SORTS = ["trendingScore", "downloads", "likes", "createdAt", "lastModified"] as const;
export const SORT_DIRECTIONS = ["-1"] as const;

export type OpenSourceSort = (typeof OPEN_SOURCE_SORTS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface OpenSourceModelsQuery {
  sort: string;
  direction: string;
}

export interface NewsQuery {
  category: string;
}

export interface OpenSourceModelQuery {
  id: string;
}

export function normalizeOpenSourceModelsQuery(raw: Record<string, string>): OpenSourceModelsQuery {
  const sort = (OPEN_SOURCE_SORTS as readonly string[]).includes(raw.sort ?? "")
    ? raw.sort!
    : OPEN_SOURCE_MODELS_DEFAULTS.sort;
  const direction = (SORT_DIRECTIONS as readonly string[]).includes(raw.direction ?? "")
    ? raw.direction!
    : OPEN_SOURCE_MODELS_DEFAULTS.direction;
  return { sort, direction };
}

export function normalizeNewsQuery(raw: Record<string, string>): NewsQuery {
  const category = (NEWS_CATS as readonly string[]).includes(raw.category ?? "")
    ? raw.category!
    : NEWS_CATS[0];
  return { category };
}

export function normalizeOpenSourceModelQuery(raw: Record<string, string>): OpenSourceModelQuery {
  return { id: (raw.id ?? "").slice(0, MAX_NAME_CHARS) };
}

export function openSourceModelsQueryString(q: Partial<OpenSourceModelsQuery> = {}): Record<string, string> {
  return {
    sort: q.sort ?? OPEN_SOURCE_MODELS_DEFAULTS.sort,
    direction: q.direction ?? OPEN_SOURCE_MODELS_DEFAULTS.direction,
  };
}

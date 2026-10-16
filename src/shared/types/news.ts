export type NewsCategory = "industry" | "opensource" | "hardware" | "research";

export const NEWS_CATEGORIES = [
  "industry",
  "opensource",
  "hardware",
  "research",
] as const satisfies readonly NewsCategory[];

export function isNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

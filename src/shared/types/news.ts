export type NewsCategory = "industry" | "opensource" | "hardware" | "research";

export const NEWS_CATEGORIES = [
  "industry",
  "opensource",
  "hardware",
  "research",
] as const satisfies readonly NewsCategory[];
export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export type NewsCategory = "industry" | "opensource" | "hardware" | "funding" | "research";

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

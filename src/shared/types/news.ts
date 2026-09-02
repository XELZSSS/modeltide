/** News feed categories; each maps to a group of RSS feeds in rssConfig. */
export type NewsCategory = "industry" | "opensource" | "hardware" | "funding";

/** A single article parsed from an RSS feed. */
export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

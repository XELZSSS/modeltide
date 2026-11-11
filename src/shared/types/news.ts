export const NEWS_CATEGORIES = ["industry", "opensource", "hardware", "research"] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
/**
 * One aggregated news row. `link` is the identity: it is the only field the parser guarantees non-empty, it is what
 * deduplication keys on, and it is the row's render key. There is deliberately no separate `id`.
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

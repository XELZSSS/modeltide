export const NEWS_CATEGORIES = ["industry", "opensource", "hardware", "research"] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
/**
 * One aggregated news row. `link` is the identity: it is the only field guaranteed non-empty by the parser, it is what
 * deduplication keys on (`news/source.ts`), and it is the row's render key on the client. There is deliberately no
 * separate `id` — the feed's `guid` was never read by any consumer, and carrying it in the contract advertised a
 * stability the client did not use.
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

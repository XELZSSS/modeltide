import { parseTs } from "@/server/parsers/parser-primitives";
import { NEWS_TTL_MS, ttlForRatio } from "@/shared/config";
import { SOURCE_LIMITS } from "@/server/config/limits";
import { MAX_FEED_BYTES, NEWS_LEG_CONCURRENCY, cacheKeys } from "@/server/config";
import { runLegs } from "@/server/sources/join-legs";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/rss-feed-parser";

import { rssFeeds } from "@/server/sources/news-feeds";
import { dedupeBy } from "@/shared/utils";
import { normalizeNewsLink } from "@/server/parsers/url";

import type { SourcePayload } from "@/shared/types";
import { defineKeyedSource, requireParsed, requireRows } from "@/server/sources/pipeline";

function pickNewsItems(ctx: AppContext, category: NewsCategory, allItems: NewsItem[]): NewsItem[] {
  let invalidDates = 0;
  const dated = allItems
    .map((item) => {
      const ts = parseTs(item.pubDate, true);
      if (ts === Number.NEGATIVE_INFINITY) invalidDates += 1;
      return { item, ts };
    })
    .filter((entry) => Number.isFinite(entry.ts));
  if (invalidDates > 0) {
    ctx.log("info", `[news] dropped ${invalidDates}/${allItems.length} items with invalid dates for "${category}"`);
  }
  return dedupeBy(
    dated.sort((a, b) => b.ts - a.ts),
    (entry) => normalizeNewsLink(entry.item.link),
  )
    .slice(0, SOURCE_LIMITS.newsPerCategory)
    .map((entry) => entry.item);
}

interface NewsRaw {
  items: NewsItem[];
  failCount: number;
  total: number;
}

async function fetchNewsRaw(ctx: AppContext, category: NewsCategory): Promise<NewsRaw> {
  // Category is validated at the route layer (qEnum with default); the feed
  // table is exhaustive for NewsCategory so this is unreachable in practice.
  const feeds = rssFeeds[category];
  const legs: { label: string; run: () => Promise<NewsItem[]> }[] = feeds.map((feed) => ({
    label: feed.id,
    run: async () =>
      requireParsed(
        parseFeed(await ctx.http.getFeed(feed.url, FEED_ACCEPT, MAX_FEED_BYTES), feed.url, {
          maxBytes: MAX_FEED_BYTES,
          maxItems: SOURCE_LIMITS.feedItemsPerFeed,
        }),
        ctx.log,
        feed.id,
      ),
  }));
  const { values, failures } = await runLegs(legs, {
    concurrency: NEWS_LEG_CONCURRENCY,
    allFailedMessage: `All ${legs.length} feed(s) for "${category}" failed`,
  });
  const allItems = values.flatMap((items) => items ?? []);
  if (failures.length > 0) {
    ctx.log(
      "warn",
      `[news] ${failures.length}/${values.length} feeds failed for "${category}": ${failures
        .map((f) => `${f.label}: ${errMsg(f.reason)}`)
        .join("; ")}`,
    );
  }
  return { items: allItems, failCount: failures.length, total: values.length };
}

const newsSource = defineKeyedSource<NewsCategory, NewsRaw, NewsItem>({
  key: (category) => cacheKeys.news(category),
  ttl: NEWS_TTL_MS,
  label: "news",
  fetch: fetchNewsRaw,
  parse: (raw, ctx, category) => {
    const items = pickNewsItems(ctx, category, raw.items);
    return requireRows(items, `news "${category}"`, "usable items", "all filtered?");
  },
  partialWhen: ({ raw }) => ({
    partial: raw.failCount > 0,
    ttl: ttlForRatio(raw.failCount, raw.total, NEWS_TTL_MS),
  }),
});

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  newsSource(ctx, category);

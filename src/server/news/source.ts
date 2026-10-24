import { parseTs } from "@/server/formats/dates";
import { NEWS_TTL_MS, ttlFor } from "@/shared/config";
import { SOURCE_LIMITS } from "@/server/formats/limits";
import { MAX_FEED_BYTES } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import { runLegs } from "@/server/join-legs";
import type { NewsCategory, NewsItem } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { errMsg } from "@/server/api/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/formats/rss-feed-parser";

import { NEWS_LEG_CONCURRENCY, rssFeeds } from "./feeds";
import { dedupeBy } from "@/shared/utils";
import { normalizeNewsLink } from "@/server/formats/url";

import { defineParamSource, requireParsed, requireRows } from "@/server/pipeline";

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
  category: NewsCategory;
  items: NewsItem[];
  failCount: number;
  total: number;
}

async function fetchNewsRaw(ctx: AppContext, category: NewsCategory): Promise<NewsRaw> {
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
  return { category, items: allItems, failCount: failures.length, total: values.length };
}

/**
 * How long a news category may stay cached at the origin in the healthy case. `src/server/registry.ts` reads this same
 * constant for the route's HTTP cache headers, so the edge window cannot drift from the origin window.
 */
export const NEWS_CATEGORY_TTL_MS = NEWS_TTL_MS;

const newsCategorySource = defineParamSource<{ category: NewsCategory }, NewsRaw, NewsItem[]>(
  ({ category }) => cacheKeys.news(category),
  {
    ttl: NEWS_CATEGORY_TTL_MS,
    label: "news",
    served: true,
    fetch: (ctx, { category }) => fetchNewsRaw(ctx, category),
    parse: (raw, ctx) =>
      requireRows(
        pickNewsItems(ctx, raw.category, raw.items),
        `news "${raw.category}"`,
        "usable items",
        "all filtered?",
      ),
    // A category that lost even one feed is cached for the degraded TTL, so the next visit retries the gap instead of
    // serving it for the full news TTL.
    partialWhen: ({ raw }) => ({
      partial: raw.failCount > 0,
      ttl: ttlFor(raw.failCount > 0, NEWS_CATEGORY_TTL_MS),
    }),
  },
);

/**
 * One category per request. A tab only ever renders one of them, and fanning out to all four (14 feeds, ~1.5 MB of XML)
 * was the heaviest thing a single invocation did — work the free plan's 10 ms CPU budget cannot pay for. Each category
 * keeps its own cache entry and its own partial flag.
 */
export const getNews = newsCategorySource;

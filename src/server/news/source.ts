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

/**
 * The items a category serves: newest first, deduped on the normalised link, capped at `newsPerCategory`.
 *
 * An item whose link cannot be parsed is dropped here rather than keyed by its raw text — `normalizeNewsLink` reports
 * that as `null` instead of inventing a comparable form, so the count below is what tells the reader the feed was
 * partly unusable.
 */
function pickNewsItems(ctx: AppContext, category: NewsCategory, allItems: NewsItem[]): NewsItem[] {
  let invalidDates = 0;
  let invalidLinks = 0;
  const dated = allItems
    .map((item) => {
      const ts = parseTs(item.pubDate, true);
      if (ts === Number.NEGATIVE_INFINITY) invalidDates += 1;
      const key = normalizeNewsLink(item.link);
      if (key === null) invalidLinks += 1;
      return { item, ts, key };
    })
    .filter((entry) => entry.key !== null && Number.isFinite(entry.ts));
  if (invalidDates > 0) {
    ctx.log("info", `[news] dropped ${invalidDates}/${allItems.length} items with invalid dates for "${category}"`);
  }
  if (invalidLinks > 0) {
    ctx.log("info", `[news] dropped ${invalidLinks}/${allItems.length} items with unparseable links for "${category}"`);
  }
  return dedupeBy(
    dated.sort((a, b) => b.ts - a.ts),
    (entry) => entry.key,
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
    run: async () => {
      const xml = await ctx.http.getFeed(feed.url, FEED_ACCEPT, MAX_FEED_BYTES);
      return requireParsed(parseFeed(xml, feed.url), ctx.log, feed.id);
    },
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

export const getNews = defineParamSource<{ category: NewsCategory }, NewsRaw, NewsItem[]>(
  ({ category }) => cacheKeys.news(category),
  {
    ttl: NEWS_TTL_MS,
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
    // A category that lost even one of its feeds is cached for the degraded TTL, so the next visit retries the gap
    // instead of serving it for the full news TTL. Losing every feed in a category is "all legs failed" (`runLegs`
    // throws), which the cache answers from its stale copy.
    partialWhen: ({ raw }) => ({
      partial: raw.failCount > 0,
      ttl: ttlFor(raw.failCount > 0, NEWS_TTL_MS),
    }),
  },
);

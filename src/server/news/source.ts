import { parseTs } from "@/server/formats/parser-primitives";
import { NEWS_TTL_MS, ttlForRatio } from "@/shared/config";
import { SOURCE_LIMITS } from "@/server/formats/limits";
import { MAX_FEED_BYTES } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import { runLegs } from "@/server/join-legs";
import type { NewsCategory, NewsItem, SourcePayload } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/types/news";
import type { NewsByCategory } from "@/shared/contract";
import type { AppContext } from "@/server/api/context";
import { errMsg } from "@/server/api/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/formats/rss-feed-parser";

import { rssFeeds } from "./feeds";
import { dedupeBy } from "@/shared/utils";
import { normalizeNewsLink } from "@/server/formats/url";

import { defineParamSource, requireParsed, requireRows } from "@/server/pipeline";

// Per-category leg cap. The 6-slot connection pool is the hard limit, so this only decides whether a category with
// many feeds (industry has five) finishes in two rounds or three.
const NEWS_LEG_CONCURRENCY = 4;

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

const newsCategorySource = defineParamSource<NewsCategory, NewsRaw, NewsItem>((category) => cacheKeys.news(category), {
  ttl: NEWS_TTL_MS,
  label: "news",
  fetch: (ctx, category) => fetchNewsRaw(ctx, category),
  parse: (raw, ctx) =>
    requireRows(pickNewsItems(ctx, raw.category, raw.items), `news "${raw.category}"`, "usable items", "all filtered?"),
  // A category that lost feeds stays partial and keeps its shortened TTL, so the next refresh retries it sooner.
  partialWhen: ({ raw }) => ({
    partial: raw.failCount > 0,
    ttl: ttlForRatio(raw.failCount, raw.total, NEWS_TTL_MS),
  }),
});

export const getNewsCategory = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  newsCategorySource(ctx, category);

/**
 * Newest fetch time across the cached categories. A failed slice carries `""` so it cannot win;
 * deriving the timestamp from the data (instead of `Date.now()`) keeps the payload ETag stable
 * between refreshes, which is what makes 304 revalidation work for this endpoint.
 */
function aggregateFetchedAt(byCategory: NewsByCategory): string {
  let newest = Number.NEGATIVE_INFINITY;
  for (const category of NEWS_CATEGORIES) {
    const ts = Date.parse(byCategory[category].fetchedAt);
    if (Number.isFinite(ts) && ts > newest) newest = ts;
  }
  return Number.isFinite(newest) ? new Date(newest).toISOString() : new Date().toISOString();
}

/** One request serves every tab: categories stay independently cached and keep their own partial flag. */
export async function getNews(ctx: AppContext): Promise<SourcePayload<NewsByCategory>> {
  const entries = await Promise.all(
    NEWS_CATEGORIES.map(async (category) => {
      try {
        return [category, await getNewsCategory(ctx, category)] as const;
      } catch (err) {
        // A dead category degrades to an empty, partial slice instead of failing the whole tab bar.
        ctx.log("warn", `[news] category "${category}" unavailable: ${errMsg(err)}`);
        return [category, { data: [], fetchedAt: "", partial: true }] as const;
      }
    }),
  );
  const byCategory = Object.fromEntries(entries) as NewsByCategory;
  return {
    data: byCategory,
    fetchedAt: aggregateFetchedAt(byCategory),
    partial: NEWS_CATEGORIES.some((category) => byCategory[category].partial),
  };
}

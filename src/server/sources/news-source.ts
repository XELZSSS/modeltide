import { parseTs } from "@/server/parsers/parser-primitives";
import { NEWS_TTL_MS, ttlForRatio } from "@/shared/config";
import { SOURCE_LIMITS } from "@/server/config/limits";
import { FAST_FETCH_OPTS, MAX_FEED_BYTES, NEWS_LEG_CONCURRENCY, cacheKeys } from "@/server/config";
import { errMsg } from "@/server/infra/task-pool";
import { runLegs } from "@/server/sources/join-legs";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/rss-feed-parser";

import { rssFeeds } from "@/server/sources/news-feeds";
import { dedupeBy } from "@/shared/utils";
import { normalizeNewsLink } from "@/server/parsers/url";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireParsed, requireRows } from "@/server/sources/pipeline";

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

async function fetchNews(
  ctx: AppContext,
  category: NewsCategory,
): Promise<{ items: NewsItem[]; failCount: number; total: number }> {
  const feeds = rssFeeds[category];
  if (!feeds || feeds.length === 0) throw new ValidationError(`Unknown news category "${category}"`);
  const legs: { label: string; run: () => Promise<NewsItem[]> }[] = feeds.map((feed) => ({
    label: feed.id,
    run: async () =>
      requireParsed(
        parseFeed(
          await ctx.http.text(feed.url, { headers: { accept: FEED_ACCEPT }, ...FAST_FETCH_OPTS }, MAX_FEED_BYTES),
          feed.url,
        ),
        ctx.log,
        feed.id,
      ),
  }));
  const { values, failures } = await runLegs(legs, { concurrency: NEWS_LEG_CONCURRENCY });
  const allItems = values.flatMap((items) => items ?? []);
  if (failures.length === values.length)
    throw new UpstreamError(`All ${values.length} feed(s) for "${category}" failed`, { retryable: true });
  if (failures.length > 0) {
    ctx.log(
      "warn",
      `[news] ${failures.length}/${values.length} feeds failed for "${category}": ${failures
        .map((f) => `${f.label}: ${errMsg(f.reason)}`)
        .join("; ")}`,
    );
  }
  return { items: pickNewsItems(ctx, category, allItems), failCount: failures.length, total: values.length };
}

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  cachedPayload(ctx, cacheKeys.news(category), NEWS_TTL_MS, async (ctx) => {
    const { items, failCount, total } = await fetchNews(ctx, category);
    requireRows(items, `news "${category}"`, "usable items", "all filtered?");
    return { rows: items, partial: failCount > 0, ttl: ttlForRatio(failCount, total, NEWS_TTL_MS) };
  });

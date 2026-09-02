import { rssConfig, NEWS_TTL_MS, cacheKeys, ttlForCount } from "@/shared/config";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/rss";
import { dedupeBy } from "@/shared/utils";

const MAX_TOTAL = 50;

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<NewsItem[]> =>
  ctx.cache.withTtl(cacheKeys.news(category), NEWS_TTL_MS, async () => {
    // Route schemas already restrict `category` to NEWS_CATEGORIES; no re-validation here.
    const urls = rssConfig[category];
    const results = await Promise.allSettled(
      urls.map(async (url) => parseFeed(await ctx.http.text(url, { headers: { accept: FEED_ACCEPT } }), url)),
    );
    const allItems: NewsItem[] = [];
    let failCount = 0;
    for (const r of results) {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else failCount++;
    }
    if (failCount === results.length && results.length > 0)
      throw new UpstreamError(`All ${results.length} RSS feed(s) for "${category}" failed`);
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const unique = dedupeBy(allItems, (i) => i.link);
    return { data: unique.slice(0, MAX_TOTAL), ttl: ttlForCount(failCount, NEWS_TTL_MS) };
  });

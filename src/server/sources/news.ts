import { rssConfig, NEWS_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, ttlForCount } from "@/shared/config";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/feed";
import { dedupeBy } from "@/shared/utils";
import { isSuitableNewsItem } from "@/server/sources/data-filter";

const MAX_TOTAL = 50;

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<NewsItem[]> =>
  ctx.cache.withTtl(cacheKeys.news(category), NEWS_TTL_MS, async () => {
    const urls = rssConfig[category];
    if (!urls || urls.length === 0) throw new UpstreamError(`No RSS feeds configured for "${category}"`);
    const results = await Promise.allSettled(
      urls.map(async (url) =>
        parseFeed(
          await ctx.http.text(url, { headers: { accept: FEED_ACCEPT }, timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 }),
          url,
        ),
      ),
    );
    const allItems: NewsItem[] = [];
    let failCount = 0;
    for (const r of results) {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else failCount++;
    }
    if (failCount === results.length)
      throw new UpstreamError(`All ${results.length} RSS feed(s) for "${category}" failed`);
    const dated = allItems.map((item) => {
      const t = Date.parse(item.pubDate);
      return { item, ts: Number.isFinite(t) ? t : 0 };
    });
    dated.sort((a, b) => b.ts - a.ts);
    // Defense-in-depth: re-apply the unified news gate (feed already filters).
    const suitable = dated.map((d) => d.item).filter((i) => isSuitableNewsItem(i.title, i.link));
    const unique = dedupeBy(suitable, (i) => {
      try {
        const u = new URL(i.link);
        // Normalize trailing slash + hostname case so the same article
        // with/without "/" doesn't appear twice.
        return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}${u.hash}`;
      } catch {
        return i.link.trim().replace(/\/+$/, "");
      }
    });
    return { data: unique.slice(0, MAX_TOTAL), ttl: ttlForCount(failCount, NEWS_TTL_MS) };
  });

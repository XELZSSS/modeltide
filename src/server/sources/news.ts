import { rssConfig, NEWS_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, ttlForCount } from "@/shared/config";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError, errMsg } from "@/server/infra";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/feed";
import { dedupeBy } from "@/shared/utils";
import { isSuitableNewsItem } from "@/server/sources/data-filter";

const MAX_TOTAL = 50;

/**
 * RSS payload cap (1MB, well under the 5MB transport ceiling): feeds are
 * text and paginated upstream, so anything larger is abuse or a misrouted
 * binary. Keeps the slowest feed from becoming the route's long pole.
 */
const MAX_FEED_BYTES = 1 * 1024 * 1024;

// Backlog: conditional requests (ETag/If-Modified-Since) would cut RSS/doc
// bandwidth sharply, but need KV-persisted validators per feed. Until then,
// short TTLs + allSettled fan-out absorb full refetches.

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<NewsItem[]> =>
  ctx.cache.withTtl(cacheKeys.news(category), NEWS_TTL_MS, async () => {
    const urls = rssConfig[category];
    if (!urls || urls.length === 0) throw new ValidationError(`Unknown news category "${category}"`);
    const results = await Promise.allSettled(
      urls.map(async (url) =>
        parseFeed(
          await ctx.http.text(
            url,
            { headers: { accept: FEED_ACCEPT }, timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 },
            MAX_FEED_BYTES,
          ),
          url,
        ),
      ),
    );
    const allItems: NewsItem[] = [];
    let failCount = 0;
    const failedUrls: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else {
        failCount++;
        failedUrls.push(`${urls[i]} (${errMsg(r.reason)})`);
      }
    });
    if (failCount === results.length)
      throw new UpstreamError(`All ${results.length} RSS feed(s) for "${category}" failed`);
    if (failCount > 0) {
      ctx.log("warn", `[news] ${failCount}/${results.length} feeds failed for "${category}": ${failedUrls.join("; ")}`);
    }
    // Unparseable dates (and the 1970 sentinel for missing dates) sink to the
    // bottom instead of mingling with genuinely old articles.
    let invalidDateCount = 0;
    const dated = allItems.map((item) => {
      const t = Date.parse(item.pubDate);
      const ts = Number.isFinite(t) && t > 0 ? t : Number.NEGATIVE_INFINITY;
      if (ts === Number.NEGATIVE_INFINITY) invalidDateCount++;
      return { item, ts };
    });
    dated.sort((a, b) => b.ts - a.ts);
    if (invalidDateCount > 0) {
      ctx.log("info", `[news] ${invalidDateCount}/${allItems.length} items with invalid dates for "${category}"`);
    }
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

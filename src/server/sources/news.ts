import { NEWS_TTL_MS, SOURCE_LIMITS, ttlForRatio } from "@/shared/config";
import { rssConfig, FAST_FETCH_OPTS, MAX_FEED_BYTES, cacheKeys } from "@/server/config";
import { runCapped } from "@/server/infra/pool";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError, zeroUpstream } from "@/server/infra/errors";
import { formatSettleErrors } from "@/server/infra/pool";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/feed";
import { parseTs } from "@/server/parsers/shaping";
import { fetchDailyPapersItems } from "@/server/sources/hf-papers";
import { dedupeBy } from "@/shared/utils";
import { isSuitableNewsItem } from "@/server/parsers/data-filter";
import { nowIso, type SourcePayload } from "@/server/sources/types";

// Dedupe key only (never served): collapse to a canonical origin+path+query
// form. Inputs are pre-validated by isSuitableNewsItem -> isValidHttpUrl.
function normalizeNewsLink(link: string): string {
  const trimmed = link.trim();
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}${u.hash}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

async function fetchNews(
  ctx: AppContext,
  category: NewsCategory,
): Promise<{ items: NewsItem[]; failCount: number; total: number }> {
  const urls = rssConfig[category];
  if (!urls || urls.length === 0) throw new ValidationError(`Unknown news category "${category}"`);
  const legTasks: (() => Promise<NewsItem[]>)[] = urls.map(
    (url) => async () =>
      parseFeed(
        await ctx.http.text(url, { headers: { accept: FEED_ACCEPT }, ...FAST_FETCH_OPTS }, MAX_FEED_BYTES),
        url,
      ),
  );
  const legLabels: string[] = [...urls];
  if (category === "research") {
    legTasks.push(() => fetchDailyPapersItems(ctx));
    legLabels.push("hf-daily-papers");
  }
  const results = await runCapped(legTasks, 5);
  const allItems: NewsItem[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failCount = results.filter((r) => r.status === "rejected").length;
  if (failCount === results.length)
    throw new UpstreamError(`All ${results.length} RSS feed(s) for "${category}" failed`);
  if (failCount > 0)
    ctx.log(
      "warn",
      `[news] ${failCount}/${results.length} feeds failed for "${category}": ${formatSettleErrors(results, legLabels)}`,
    );
  let invalidDateCount = 0;
  // HF daily papers arrive upvote-ranked and keep that order at the head of
  // the feed (up to quota); RSS legs compete by date for the remaining seats.
  // Without the quota the papers drown below the date-sorted cut.
  const isPaper = (i: NewsItem) => i.id.startsWith("hf-paper-");
  const dated = allItems
    .filter((i) => !isPaper(i))
    .map((item) => {
      const ts = parseTs(item.pubDate, true);
      if (ts === Number.NEGATIVE_INFINITY) invalidDateCount++;
      return { item, ts };
    });
  dated.sort((a, b) => b.ts - a.ts);
  if (invalidDateCount > 0)
    ctx.log("info", `[news] ${invalidDateCount}/${allItems.length} items with invalid dates for "${category}"`);
  const suitable = dated.map((d) => d.item).filter((i) => isSuitableNewsItem(i.title, i.link));
  const paperPicked = dedupeBy(
    allItems.filter(isPaper).filter((i) => isSuitableNewsItem(i.title, i.link)),
    (i) => normalizeNewsLink(i.link),
  ).slice(0, SOURCE_LIMITS.hfPapersQuota);
  const paperLinks = new Set(paperPicked.map((i) => normalizeNewsLink(i.link)));
  const restPicked = dedupeBy(suitable, (i) => normalizeNewsLink(i.link))
    .filter((i) => !paperLinks.has(normalizeNewsLink(i.link)))
    .slice(0, SOURCE_LIMITS.newsPerCategory - paperPicked.length);
  return { items: [...paperPicked, ...restPicked], failCount, total: results.length };
}

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  ctx.cache.withTtl<SourcePayload<NewsItem[]>>(cacheKeys.news(category), NEWS_TTL_MS, async () => {
    const { items, failCount, total } = await fetchNews(ctx, category);
    // Never cache an empty list: every other source throws zeroUpstream so the
    // stale copy survives. An empty news array would otherwise poison KV for 30m.
    if (items.length === 0) throw zeroUpstream(`news "${category}"`, "usable items", "all filtered?");
    return {
      data: { data: items, fetchedAt: nowIso(), ...(failCount > 0 ? { partial: true } : {}) },
      ttl: ttlForRatio(failCount, total, NEWS_TTL_MS),
    };
  });

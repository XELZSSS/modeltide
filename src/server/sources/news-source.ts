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

import { fetchDailyPapersItems } from "@/server/sources/hf-papers-source";
import { rssConfig } from "@/server/sources/news-feeds";
import { dedupeBy } from "@/shared/utils";
import { normalizeNewsLink } from "@/server/parsers/url";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireParsed, requireRows } from "@/server/sources/pipeline";

function sortNewestFirst(
  ctx: AppContext,
  category: NewsCategory,
  allItems: NewsItem[],
): { suitable: NewsItem[]; papers: NewsItem[] } {
  let invalidDateCount = 0;
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
  return { suitable: dated.map((d) => d.item), papers: allItems.filter(isPaper) };
}

function pickNewsItems(suitable: NewsItem[], papers: NewsItem[]): NewsItem[] {
  const paperPicked = dedupeBy(papers, (i) => normalizeNewsLink(i.link)).slice(0, SOURCE_LIMITS.hfPapersQuota);
  const paperLinks = new Set(paperPicked.map((i) => normalizeNewsLink(i.link)));
  const restPicked = dedupeBy(suitable, (i) => normalizeNewsLink(i.link))
    .filter((i) => !paperLinks.has(normalizeNewsLink(i.link)))
    .slice(0, SOURCE_LIMITS.newsPerCategory - paperPicked.length);
  return [...paperPicked, ...restPicked];
}

async function fetchNews(
  ctx: AppContext,
  category: NewsCategory,
): Promise<{ items: NewsItem[]; failCount: number; total: number }> {
  const urls = rssConfig[category];
  if (!urls || urls.length === 0) throw new ValidationError(`Unknown news category "${category}"`);
  const legs = urls.map((url) => ({
    label: url,
    run: async () =>
      requireParsed(
        parseFeed(
          await ctx.http.text(url, { headers: { accept: FEED_ACCEPT }, ...FAST_FETCH_OPTS }, MAX_FEED_BYTES),
          url,
        ),
      ),
  }));
  if (category === "research") {
    legs.push({ label: "hf-daily-papers", run: () => fetchDailyPapersItems(ctx) });
  }
  const { values, failures } = await runLegs(legs, { concurrency: NEWS_LEG_CONCURRENCY });
  const allItems = values.flatMap((items) => items ?? []);
  if (failures.length === values.length)
    throw new UpstreamError(`All ${values.length} RSS feed(s) for "${category}" failed`);
  if (failures.length > 0) {
    ctx.log(
      "warn",
      `[news] ${failures.length}/${values.length} feeds failed for "${category}": ${failures
        .map((f) => `${f.label}: ${errMsg(f.reason)}`)
        .join("; ")}`,
    );
  }
  const { suitable, papers } = sortNewestFirst(ctx, category, allItems);
  return { items: pickNewsItems(suitable, papers), failCount: failures.length, total: values.length };
}

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  cachedPayload(ctx, cacheKeys.news(category), NEWS_TTL_MS, async () => {
    const { items, failCount, total } = await fetchNews(ctx, category);
    requireRows(items, `news "${category}"`, "usable items", "all filtered?");
    return { rows: items, partial: failCount > 0, ttl: ttlForRatio(failCount, total, NEWS_TTL_MS) };
  });

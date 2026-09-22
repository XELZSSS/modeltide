import { parseTs } from "@/server/parsers/parser-primitives";
import { NEWS_TTL_MS, SOURCE_LIMITS, ttlForRatio } from "@/shared/config";
import { rssConfig, FAST_FETCH_OPTS, MAX_FEED_BYTES, NEWS_LEG_CONCURRENCY, cacheKeys } from "@/server/config";
import { runCapped, errMsg } from "@/server/infra/task-pool";
import type { NewsItem, NewsCategory } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { FEED_ACCEPT, parseFeed } from "@/server/parsers/rss-feed-parser";

import { fetchDailyPapersItems } from "@/server/sources/hf-papers-source";
import { dedupeBy, normalizeNewsLink } from "@/shared/utils";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireParsed, requireRows } from "@/server/sources/pipeline";

type LegResult = PromiseSettledResult<NewsItem[]>[];

function collectLegItems(results: LegResult): { allItems: NewsItem[]; failCount: number } {
  return {
    allItems: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failCount: results.filter((r) => r.status === "rejected").length,
  };
}

function logLegFailures(
  ctx: AppContext,
  category: NewsCategory,
  legLabels: string[],
  results: LegResult,
  failCount: number,
): void {
  if (failCount === 0) return;
  ctx.log(
    "warn",
    `[news] ${failCount}/${results.length} feeds failed for "${category}": ${results
      .map((r, i) => (r.status === "rejected" ? `${legLabels[i] ?? i}: ${errMsg(r.reason)}` : null))
      .filter(Boolean)
      .join("; ")}`,
  );
}

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
  const legTasks: (() => Promise<NewsItem[]>)[] = urls.map(
    (url) => async () =>
      requireParsed(
        parseFeed(
          await ctx.http.text(url, { headers: { accept: FEED_ACCEPT }, ...FAST_FETCH_OPTS }, MAX_FEED_BYTES),
          url,
        ),
      ),
  );
  const legLabels: string[] = [...urls];
  if (category === "research") {
    legTasks.push(() => fetchDailyPapersItems(ctx));
    legLabels.push("hf-daily-papers");
  }
  const results = await runCapped(legTasks, NEWS_LEG_CONCURRENCY);
  const { allItems, failCount } = collectLegItems(results);
  if (failCount === results.length)
    throw new UpstreamError(`All ${results.length} RSS feed(s) for "${category}" failed`);
  logLegFailures(ctx, category, legLabels, results, failCount);
  // Every leg's parser already drops unsuitable titles/links before returning
  // (feed.ts / huggingface.ts), so items reaching here are pre-validated.
  const { suitable, papers } = sortNewestFirst(ctx, category, allItems);
  return { items: pickNewsItems(suitable, papers), failCount, total: results.length };
}

export const getNews = (ctx: AppContext, category: NewsCategory): Promise<SourcePayload<NewsItem[]>> =>
  cachedPayload(ctx, cacheKeys.news(category), NEWS_TTL_MS, async () => {
    const { items, failCount, total } = await fetchNews(ctx, category);
    requireRows(items, `news "${category}"`, "usable items", "all filtered?");
    return { rows: items, partial: failCount > 0, ttl: ttlForRatio(failCount, total, NEWS_TTL_MS) };
  });

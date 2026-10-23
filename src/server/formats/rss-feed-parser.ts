import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { isRecord } from "./scalars";
import { MAX_FEED_BYTES, SOURCE_LIMITS } from "./limits";
import { utf8ByteLength } from "@/server/util/hash";
import { zeroUpstreamMessage, errMsg } from "@/server/api/errors";
import { channelTitle, toNewsItem } from "./feed-fields";
import { parseFail, parseOk, type ParseResult } from "./parse-result";

const MAX_ITEMS_PER_FEED = SOURCE_LIMITS.feedItemsPerFeed;

export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  htmlEntities: false,
});

export function parseFeed(
  xml: unknown,
  sourceUrl: unknown,
  opts?: { maxBytes?: number; maxItems?: number },
): ParseResult<NewsItem[]> {
  const urlLabel = typeof sourceUrl === "string" ? sourceUrl : "unknown";
  if (typeof xml !== "string") {
    return parseFail(`Feed with non-string body rejected at ${urlLabel}`);
  }
  const bytes = utf8ByteLength(xml);
  const maxBytes = opts?.maxBytes ?? MAX_FEED_BYTES;
  if (bytes > maxBytes) {
    return parseFail(`Feed too large at ${urlLabel} (${bytes} bytes)`);
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    return parseFail(`Unparseable feed at ${urlLabel}: ${errMsg(err)}`);
  }
  return parseChannel(parsed, urlLabel, opts?.maxItems ?? MAX_ITEMS_PER_FEED);
}

function resolveChannel(feed: unknown): Record<string, unknown> | undefined {
  if (!isRecord(feed)) return undefined;
  const rss = isRecord(feed.rss) ? (feed.rss as Record<string, unknown>) : undefined;
  const rawChannel: unknown = rss?.channel ?? feed.channel ?? feed.feed ?? feed;
  return isRecord(rawChannel) ? rawChannel : undefined;
}

function parseChannel(feed: unknown, sourceUrl: string, maxItems: number): ParseResult<NewsItem[]> {
  const channel = resolveChannel(feed);
  if (!channel || (channel.item == null && channel.entry == null && channel.title == null)) {
    return parseFail(`Unrecognized feed format at ${sourceUrl}`);
  }
  let items = (channel.item ?? channel.entry ?? []) as unknown;
  if (!Array.isArray(items)) items = [items];
  const source = channelTitle(channel, sourceUrl);
  const rawItems = items as unknown[];
  const records = rawItems.filter((item): item is Record<string, unknown> => isRecord(item));
  if (records.length === 0 && rawItems.length > 0) {
    return parseFail(`Unrecognized feed items at ${sourceUrl}`);
  }
  const bounded = records.slice(0, maxItems * 4);
  const parsed: NewsItem[] = [];
  let dropped = 0;
  for (const item of bounded) {
    const news = toNewsItem(item, source);
    if (!news) {
      dropped += 1;
      continue;
    }
    parsed.push(news);
    if (parsed.length >= maxItems) break;
  }
  if (parsed.length === 0) {
    return parseFail(zeroUpstreamMessage(`Feed at ${sourceUrl}`, "usable items", `raw=${records.length}, kept=0`));
  }
  return parseOk(parsed, dropped > 0 ? [`Dropped ${dropped} unusable feed entries at ${sourceUrl}`] : []);
}

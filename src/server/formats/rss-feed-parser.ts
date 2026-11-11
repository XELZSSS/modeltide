import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { isRecord } from "./scalars";
import { MAX_FEED_BYTES, SOURCE_LIMITS } from "./limits";
import { utf8ByteLength } from "@/server/util/hash";
import { zeroUpstreamMessage, errMsg } from "@/server/api/errors";
import { FEED_CONTAINERS, FEED_ELEMENTS, FEED_ITEM_KEYS, FEED_OPAQUE_BODY_NODE } from "@/server/news/wire";
import { channelTitle, toNewsItem } from "./feed-fields";
import { capItems, MAX_ITEMS_SCAN_FACTOR } from "./feed-cap";
import { mapRows } from "./parse-rows";
import { parseFail, parseOk, type ParseResult } from "./parse-result";

const MAX_ITEMS_PER_FEED = SOURCE_LIMITS.feedItemsPerFeed;

export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  htmlEntities: false,
  /**
   * Keeps the article body as one opaque string. `toNewsItem` reads title, link and dates only, while a full-text feed
   * spends most of its bytes inside `content:encoded`, which would otherwise be parsed into a subtree per article.
   */
  stopNodes: [FEED_OPAQUE_BODY_NODE],
});

export function parseFeed(xml: unknown, sourceUrl: unknown, sourceName?: string): ParseResult<NewsItem[]> {
  const urlLabel = typeof sourceUrl === "string" ? sourceUrl : "unknown";
  if (typeof xml !== "string") {
    return parseFail(`Feed with non-string body rejected at ${urlLabel}`);
  }
  const maxBytes = MAX_FEED_BYTES;
  // A UTF-16 code unit encodes to at most three UTF-8 bytes, so a body whose length already fits the cap in that worst
  // case skips the full char-by-char measurement; most feeds take that path.
  if (xml.length > maxBytes) {
    return parseFail(`Feed too large at ${urlLabel} (${xml.length} chars)`);
  }
  if (xml.length * 3 > maxBytes) {
    const bytes = utf8ByteLength(xml);
    if (bytes > maxBytes) return parseFail(`Feed too large at ${urlLabel} (${bytes} bytes)`);
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(capItems(xml, MAX_ITEMS_PER_FEED * MAX_ITEMS_SCAN_FACTOR));
  } catch (err) {
    return parseFail(`Unparseable feed at ${urlLabel}: ${errMsg(err)}`);
  }
  return parseChannel(parsed, urlLabel, MAX_ITEMS_PER_FEED, sourceName);
}

function resolveChannel(feed: unknown): Record<string, unknown> | undefined {
  if (!isRecord(feed)) return undefined;
  const rss = isRecord(feed[FEED_CONTAINERS[0]]) ? (feed[FEED_CONTAINERS[0]] as Record<string, unknown>) : undefined;
  const rawChannel: unknown = rss?.[FEED_CONTAINERS[1]] ?? feed[FEED_CONTAINERS[1]] ?? feed[FEED_CONTAINERS[2]] ?? feed;
  return isRecord(rawChannel) ? rawChannel : undefined;
}

function parseChannel(
  feed: unknown,
  sourceUrl: string,
  maxItems: number,
  sourceName: string | undefined,
): ParseResult<NewsItem[]> {
  const channel = resolveChannel(feed);
  if (
    !channel ||
    (channel[FEED_ITEM_KEYS[0]] == null && channel[FEED_ITEM_KEYS[1]] == null && channel[FEED_ELEMENTS.title] == null)
  ) {
    return parseFail(`Unrecognized feed format at ${sourceUrl}`);
  }
  let items = (channel[FEED_ITEM_KEYS[0]] ?? channel[FEED_ITEM_KEYS[1]] ?? []) as unknown;
  if (!Array.isArray(items)) items = [items];
  const source = channelTitle(channel, sourceUrl, sourceName);
  if (source === null) {
    return parseFail(`Unrecognized feed source at ${sourceUrl}`);
  }
  const rawItems = items as unknown[];
  const records = rawItems.filter((item): item is Record<string, unknown> => isRecord(item));
  if (records.length === 0 && rawItems.length > 0) {
    return parseFail(`Unrecognized feed items at ${sourceUrl}`);
  }
  // `mapRows` stops once `maxItems` rows are kept and counts the entries `toNewsItem` rejects on the way, which is the
  // number the warning names.
  const bounded = records.slice(0, maxItems * MAX_ITEMS_SCAN_FACTOR);
  const { rows: parsed, dropped } = mapRows(bounded, (item) => toNewsItem(item, source), maxItems);
  if (parsed.length === 0) {
    return parseFail(zeroUpstreamMessage(`Feed at ${sourceUrl}`, "usable items", `raw=${records.length}, kept=0`));
  }
  return parseOk(parsed, dropped > 0 ? [`Dropped ${dropped} unusable feed entries at ${sourceUrl}`] : []);
}

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
  /**
   * Keeps the article body as one opaque string. `toNewsItem` reads title, link and dates only, while the MIT News
   * feed spends three quarters of its bytes inside `content:encoded` — building a subtree for that text cost 10.1 ms
   * of a 10 ms CPU budget per refresh (7.4 ms with this). Verified against all fourteen configured feeds: the emitted
   * NewsItem rows are identical either way.
   */
  stopNodes: ["*.content:encoded"],
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
  const maxBytes = opts?.maxBytes ?? MAX_FEED_BYTES;
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
    parsed = parser.parse(capItems(xml, (opts?.maxItems ?? MAX_ITEMS_PER_FEED) * MAX_ITEMS_SCAN_FACTOR));
  } catch (err) {
    return parseFail(`Unparseable feed at ${urlLabel}: ${errMsg(err)}`);
  }
  return parseChannel(parsed, urlLabel, opts?.maxItems ?? MAX_ITEMS_PER_FEED);
}

/**
 * How many items past the wanted count are still parsed, matching the bound `parseChannel` then applies. Params that
 * could drop an item (a missing link or date) mean the kept ones can come from further down the list.
 */
const MAX_ITEMS_SCAN_FACTOR = 4;

const ITEM_CLOSERS = ["</item>", "</entry>"] as const;
/**
 * The tags a feed closes its container with, most complete first: a document needs whichever of these it opened, so
 * the match has to cover the outermost one. The real feeds separate them with whitespace (`</channel>\n</rss>`), which
 * is why they are matched individually rather than as one literal.
 */
const FEED_TAILS = ["</channel></rss>", "</channel>\n</rss>", "</channel>\r\n</rss>", "</feed>"] as const;

/**
 * Cuts the document after the last item the caller can still reach, so the XML parser does not build a subtree for
 * every item in a long feed. The Hugging Face blog ships 890 items for a 30-item limit, and parsing all of them cost
 * 19 ms of a 10 ms CPU budget — the largest single cost in the news route.
 *
 * A feed is returned untouched unless it carries more items than `keep`, and only when its own closing tag can be
 * reused, so the document the parser sees stays well-formed. Verified against all fourteen configured feeds: the
 * parsed rows are identical either way.
 */
function capItems(xml: string, keep: number): string {
  for (const closer of ITEM_CLOSERS) {
    let cut = -1;
    let from = 0;
    for (let i = 0; i < keep; i++) {
      const at = xml.indexOf(closer, from);
      if (at < 0) break;
      from = at + closer.length;
      cut = from;
    }
    if (cut < 0 || cut >= xml.length) continue;
    const tail = FEED_TAILS.find((candidate) => xml.includes(candidate));
    // No recognizable closing tag: leave the document alone rather than append a guess.
    if (tail === undefined) continue;
    return xml.slice(0, cut) + tail;
  }
  return xml;
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
  const bounded = records.slice(0, maxItems * MAX_ITEMS_SCAN_FACTOR);
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

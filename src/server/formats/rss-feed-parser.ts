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
   * Keeps the article body as one opaque string. `toNewsItem` reads title, link and dates only, while a full-text feed
   * spends most of its bytes inside `content:encoded` — building a subtree for that text cost 10.1 ms of a 10 ms CPU
   * budget per refresh (7.4 ms with this). The emitted NewsItem rows are identical either way.
   */
  stopNodes: ["*.content:encoded"],
});

export function parseFeed(xml: unknown, sourceUrl: unknown): ParseResult<NewsItem[]> {
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
  return parseChannel(parsed, urlLabel, MAX_ITEMS_PER_FEED);
}

/**
 * How many items past the wanted count are still parsed, matching the bound `parseChannel` then applies. Params that
 * could drop an item (a missing link or date) mean the kept ones can come from further down the list.
 */
const MAX_ITEMS_SCAN_FACTOR = 4;

const ITEM_CLOSERS = ["</item>", "</entry>"] as const;
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";
/**
 * The document's own container closing tags: everything the feed wrote after its last item closer, copied verbatim.
 * A table of literal tails — `</channel></rss>`, `</feed>` and their whitespace variants — missed a feed whose
 * container was named anything else (a namespaced `<rss>`, an RDF document, a comment before the closer), left the
 * document alone, and then built a subtree for every item in it: the CPU cost this function exists to avoid, failing
 * silently. Reusing the bytes the document already carries cannot miss.
 *
 * `undefined` when nothing follows the last item: an unclosed document stays untouched rather than getting a guess.
 */
function feedTail(xml: string, closer: string): string | undefined {
  const last = xml.lastIndexOf(closer);
  if (last < 0) return undefined;
  const tail = xml.slice(last + closer.length);
  return tail.trim() === "" ? undefined : tail;
}

/**
 * Cuts the document after the last item the caller can still reach, so the XML parser does not build a subtree for
 * every item in a long feed. A feed that ships hundreds of items against a 30-item limit costs 19 ms of a 10 ms CPU
 * budget — the largest single cost in the news route.
 *
 * Only a feed carrying more items than `keep` is touched, and only when its own closing tag can be reused, so the
 * document the parser sees stays well-formed: the tail is whatever bytes the feed wrote after its last item closer.
 *
 * A closer inside a comment or a CDATA section is not an item: `content:encoded` is HTML in a CDATA wrapper, so a code
 * sample can carry a literal `</item>`, and a commented-out item carries a whole one. Counting either put the cut
 * inside an item and left the document malformed.
 */
export function capItems(xml: string, keep: number): string {
  for (const closer of ITEM_CLOSERS) {
    let cut = -1;
    let seen = 0;
    let i = 0;
    while (i < xml.length && seen < keep) {
      if (xml.startsWith(COMMENT_OPEN, i)) {
        const end = xml.indexOf(COMMENT_CLOSE, i + COMMENT_OPEN.length);
        i = end < 0 ? xml.length : end + COMMENT_CLOSE.length;
        continue;
      }
      if (xml.startsWith(CDATA_OPEN, i)) {
        const end = xml.indexOf(CDATA_CLOSE, i + CDATA_OPEN.length);
        i = end < 0 ? xml.length : end + CDATA_CLOSE.length;
        continue;
      }
      if (xml.startsWith(closer, i)) {
        seen += 1;
        i += closer.length;
        cut = i;
        continue;
      }
      i += 1;
    }
    if (seen < keep || cut < 0 || cut >= xml.length) continue;
    const tail = feedTail(xml, closer);
    // Nothing follows the last item: leave the document alone rather than append a guess.
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
  if (source === null) {
    return parseFail(`Unrecognized feed source at ${sourceUrl}`);
  }
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

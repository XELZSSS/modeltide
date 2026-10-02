import { isSuitableNewsItem, isRecord, truncateSafe, MAX_NEWS_TITLE_CHARS } from "@/server/parsers/parser-primitives";
import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { MAX_FEED_BYTES } from "@/server/config";
import { fnv1aHash, utf8ByteLength } from "@/server/infra/hash";
import { sourceNameFromUrl as channelHost } from "@/server/parsers/url";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import { decodeEntities } from "@/server/parsers/html-entities";
import { stripHtml } from "@/server/parsers/html-to-text";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import { SOURCE_LIMITS } from "@/server/config/limits";

const MAX_ITEMS_PER_FEED = SOURCE_LIMITS.feedItemsPerFeed;
const UNSAFE_LINK_CHARS_RE = /["<>]/;

const MAX_LINK_CHARS = 2048;
const MAX_ID_CHARS = 2048;
const MAX_DATE_CHARS = 64;

export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  htmlEntities: false,
});

function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return cleanTitle(text) || channelHost(sourceUrl);
}

function textOf(v: unknown): string | null {
  if (Array.isArray(v)) v = v[0];
  if (typeof v === "string") return v.trim() ? v : null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isRecord(v)) {
    const t = v["#text"] ?? v.text;
    if (typeof t === "string" && t.trim()) return t;
    if (typeof t === "number" && Number.isFinite(t)) return String(t);
  }
  return null;
}

function cleanTitle(raw: string): string {
  const stripped = stripHtml(raw);
  const decoded = decodeEntities(stripped);
  const clean = decoded.includes("<") ? stripHtml(decoded) : decoded;
  return truncateSafe(clean, MAX_NEWS_TITLE_CHARS).trim();
}

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function linkHref(link: unknown): string | null {
  if (typeof link === "string") return decodeEntities(link.trim()) || null;
  if (!isRecord(link)) return null;
  const href = link["@_href"] ?? link.href ?? link["#text"];
  if (typeof href !== "string") return null;
  return decodeEntities(href.trim()) || null;
}

function itemLink(item: Record<string, unknown>): string | null {
  const rawLink = item.link;
  if (!Array.isArray(rawLink)) return linkHref(rawLink);
  const alternate = rawLink.find((l) => isRecord(l) && l["@_rel"] === "alternate");
  const alternateHref = alternate === undefined ? null : linkHref(alternate);
  if (alternateHref) return alternateHref;
  for (const l of rawLink) {
    const href = linkHref(l);
    if (href) return href;
  }
  return null;
}

function itemId(item: Record<string, unknown>, link: string | null, title: string): string {
  const guid = textOf(item.guid ?? item.id)?.trim();
  if (!guid) return link ?? `title:${title}`;
  return guid.length > MAX_ID_CHARS ? fnv1aHash(guid) : guid;
}

export function parseFeed(xml: unknown, sourceUrl: unknown): ParseResult<NewsItem[]> {
  const urlLabel = typeof sourceUrl === "string" ? sourceUrl : "unknown";
  if (typeof xml !== "string") {
    return parseFail(`Feed with non-string body rejected at ${urlLabel}`);
  }
  const sourceUrlStr = urlLabel;
  const bytes = utf8ByteLength(xml);
  if (bytes > MAX_FEED_BYTES) {
    return parseFail(`Feed too large at ${sourceUrlStr} (${bytes} bytes)`);
  }
  const head = xml.slice(0, 8192);
  const doctypeAt = head.search(/<!DOCTYPE/i);
  if (doctypeAt !== -1 && /<!ENTITY/i.test(head.slice(doctypeAt))) {
    return parseFail(`Feed with entity-bearing DOCTYPE rejected at ${sourceUrlStr}`);
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    return parseFail(`Unparseable feed at ${sourceUrlStr}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseChannel(parsed, sourceUrlStr);
}

function resolveChannel(feed: unknown): Record<string, unknown> | undefined {
  if (!isRecord(feed)) return undefined;
  const rss = isRecord(feed.rss) ? (feed.rss as Record<string, unknown>) : undefined;
  const rawChannel: unknown = rss?.channel ?? feed.channel ?? feed.feed ?? feed;
  return isRecord(rawChannel) ? rawChannel : undefined;
}

function toNewsItem(item: Record<string, unknown>, source: string): NewsItem | null {
  const rawLink = itemLink(item);
  if (!rawLink) return null;
  const link = rawLink.trim().slice(0, MAX_LINK_CHARS).replace(/ /g, "%20");
  if (UNSAFE_LINK_CHARS_RE.test(link) || hasControlChars(link)) return null;
  const rawTitle = textOf(item.title) ?? "";
  const title = cleanTitle(rawTitle);
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    id: itemId(item, link, title),
    title,
    link,
    pubDate:
      textOf(item.pubDate)?.trim().slice(0, MAX_DATE_CHARS) ??
      textOf(item.published)?.trim().slice(0, MAX_DATE_CHARS) ??
      textOf(item.updated)?.trim().slice(0, MAX_DATE_CHARS) ??
      "",
    source,
  };
}

function parseChannel(feed: unknown, sourceUrl: string): ParseResult<NewsItem[]> {
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
  const bounded = records.slice(0, MAX_ITEMS_PER_FEED * 4);
  const parsed: NewsItem[] = [];
  let dropped = 0;
  for (const item of bounded) {
    const news = toNewsItem(item, source);
    if (!news) {
      dropped += 1;
      continue;
    }
    parsed.push(news);
    if (parsed.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (parsed.length === 0) {
    return parseFail(zeroUpstreamMessage(`Feed at ${sourceUrl}`, "usable items", `raw=${records.length}, kept=0`));
  }
  return parseOk(parsed, dropped > 0 ? [`Dropped ${dropped} unusable feed entries at ${sourceUrl}`] : []);
}

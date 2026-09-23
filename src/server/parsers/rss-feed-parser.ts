import { isSuitableNewsItem, isRecord, truncateSafe } from "@/server/parsers/parser-primitives";
import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { MAX_FEED_BYTES } from "@/server/config";
import { utf8ByteLength } from "@/server/infra/hash";
import { sourceNameFromUrl as channelHost } from "@/server/parsers/url";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import { decodeEntities } from "@/server/parsers/html-entities";
import { stripHtml } from "@/server/parsers/html-to-text";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import { SOURCE_LIMITS } from "@/server/config/limits";

const MAX_ITEMS_PER_FEED = SOURCE_LIMITS.feedItemsPerFeed;
const UNSAFE_LINK_CHARS_RE = /["<>\s]/;

const MAX_TITLE_CHARS = 300;
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
  return truncateSafe(clean, MAX_TITLE_CHARS).trim();
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
  if (Array.isArray(rawLink)) {
    const rel = (l: unknown) => (isRecord(l) ? l["@_rel"] : undefined);
    const withHref = (l: unknown): boolean => linkHref(l) !== null;
    const alternate = rawLink.find((l) => rel(l) === "alternate");
    const chosen = alternate != null && withHref(alternate) ? alternate : rawLink.find(withHref);
    return chosen == null ? null : linkHref(chosen);
  }
  return linkHref(rawLink);
}

function itemId(item: Record<string, unknown>, link: string | null, title: string): string {
  const raw = item.guid ?? item.id;
  return textOf(raw)?.trim().slice(0, MAX_ID_CHARS) ?? link ?? `title:${title}`;
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
  const link = rawLink.trim().slice(0, MAX_LINK_CHARS);
  const rawTitle = textOf(item.title) ?? "";
  const title = cleanTitle(rawTitle);
  if (!isSuitableNewsItem(title, link)) return null;
  if (UNSAFE_LINK_CHARS_RE.test(link)) return null;
  return {
    id: itemId(item, link, title),
    title,
    link,
    pubDate:
      textOf(item.pubDate)?.trim().slice(0, MAX_DATE_CHARS) ??
      textOf(item.published)?.trim().slice(0, MAX_DATE_CHARS) ??
      textOf(item.updated)?.trim().slice(0, MAX_DATE_CHARS) ??
      "1970-01-01T00:00:00Z",
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
  // Cap work before mapping: a hostile feed could stuff thousands of items inside the 2MB byte cap.
  const bounded = records.slice(0, MAX_ITEMS_PER_FEED * 4);
  const parsed = bounded
    .map((item) => toNewsItem(item, source))
    .filter((x: NewsItem | null): x is NewsItem => x !== null)
    .slice(0, MAX_ITEMS_PER_FEED);
  if (parsed.length === 0) {
    return parseFail(zeroUpstreamMessage(`Feed at ${sourceUrl}`, "usable items", `raw=${records.length}, kept=0`));
  }
  return parseOk(parsed);
}

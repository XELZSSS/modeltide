import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { MAX_FEED_BYTES } from "@/server/config";
import { utf8ByteLength } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";
import { isSuitableNewsItem } from "@/server/sources/data-filter";
import { isRecord } from "@/server/parsers/primitives";
import { decodeEntities } from "@/server/parsers/entities";
import { stripHtml } from "@/server/parsers/html";
import { SOURCE_LIMITS } from "@/shared/config";

const MAX_ITEMS_PER_FEED = SOURCE_LIMITS.feedItemsPerFeed;
// Hoisted: tested once per feed item in toNewsItem.
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

function sourceNameFrom(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "Unknown";
  }
}

function textOf(v: unknown): string | null {
  // Malformed feeds can repeat elements: <title>A</title><title>B</title>.
  // fast-xml-parser yields an array — take the first instead of dropping the item.
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

function truncateSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  // Never split a UTF-16 surrogate pair (emoji etc.) at the cut point.
  const cut = max - 1;
  const c = s.charCodeAt(cut);
  return c >= 0xd800 && c <= 0xdbff ? s.slice(0, cut) : s.slice(0, max);
}

function cleanTitle(raw: string): string {
  const stripped = stripHtml(raw);
  const decoded = decodeEntities(stripped);
  const clean = decoded.includes("<") ? stripHtml(decoded) : decoded;
  return truncateSafe(clean, MAX_TITLE_CHARS).trim();
}

function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return cleanTitle(text) || sourceNameFrom(sourceUrl);
}

function linkHref(link: unknown): string | null {
  // XML entity decode: `processEntities` is off (XXE hardening), so raw feed
  // text keeps `&amp;` — without this, every query-string link stays broken.
  // Decode exactly once, BEFORE the ["<>] sanity check in toNewsItem.
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
    // An alternate link with no usable href should not sink the item —
    // fall back to the first link that actually carries an href.
    const chosen = alternate != null && withHref(alternate) ? alternate : rawLink.find(withHref);
    return chosen == null ? null : linkHref(chosen);
  }
  return linkHref(rawLink);
}

function itemId(item: Record<string, unknown>, link: string | null, title: string): string {
  const raw = item.guid ?? item.id;
  return textOf(raw)?.trim().slice(0, MAX_ID_CHARS) ?? link ?? `title:${title}`;
}

export function parseFeed(xml: string, sourceUrl: string): NewsItem[] {
  const bytes = utf8ByteLength(xml);
  if (bytes > MAX_FEED_BYTES) {
    throw new UpstreamError(`Feed too large at ${sourceUrl} (${bytes} bytes)`);
  }
  const doctypeMatch = /<!DOCTYPE[^>[]*(\[[\s\S]{0,4096}?\])?/i.exec(xml.slice(0, 8192));
  if (doctypeMatch && /<!ENTITY/i.test(doctypeMatch[0])) {
    throw new UpstreamError(`Feed with entity-bearing DOCTYPE rejected at ${sourceUrl}`);
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new UpstreamError(`Unparseable feed at ${sourceUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseChannel(parsed, sourceUrl);
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

function parseChannel(feed: unknown, sourceUrl: string): NewsItem[] {
  const channel = resolveChannel(feed);
  if (!channel || (channel.item == null && channel.entry == null && channel.title == null)) {
    throw new UpstreamError(`Unrecognized feed format at ${sourceUrl}`);
  }
  let items = (channel.item ?? channel.entry ?? []) as unknown;
  if (!Array.isArray(items)) items = [items];
  const source = channelTitle(channel, sourceUrl);
  const records = (items as unknown[]).filter((item): item is Record<string, unknown> => isRecord(item));
  if (records.length === 0 && (items as unknown[]).length > 0) {
    throw new UpstreamError(`Unrecognized feed items at ${sourceUrl}`);
  }
  const parsed = records
    .map((item) => toNewsItem(item, source))
    .filter((x: NewsItem | null): x is NewsItem => x !== null)
    .slice(0, MAX_ITEMS_PER_FEED);
  if (parsed.length === 0) {
    throw new UpstreamError(`Feed at ${sourceUrl} yielded 0 usable items (raw=${records.length}, kept=0)`);
  }
  return parsed;
}

import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { decodeEntities, stripHtml } from "./html";

/** Cap per-feed items before merging so one noisy feed cannot dominate the response. */
const MAX_ITEMS_PER_FEED = 50;

/** Maximum XML feed size in bytes (2MB) to prevent Billion Laughs attacks. */
const MAX_XML_BYTES = 2 * 1024 * 1024;

/** Accept header for RSS/Atom fetches. */
export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/** Type guard for plain objects with string keys. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function sourceNameFrom(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch (e) {
    console.warn("[rss] failed to parse source URL:", e);
    return "Unknown";
  }
}

/** Extract text from a simple element value: a string, or an object with a "#text" node. */
function textOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v : null;
  if (isRecord(v)) {
    const t = v["#text"];
    if (typeof t === "string" && t.trim()) return t;
  }
  return null;
}

function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return decodeEntities(text) || sourceNameFrom(sourceUrl);
}

function linkHref(link: unknown): string | null {
  if (typeof link === "string") return link;
  if (!isRecord(link)) return null;
  const href = link["@_href"] ?? link.href;
  return typeof href === "string" ? href : null;
}

function itemLink(item: Record<string, unknown>): string | null {
  const rawLink = item.link;
  if (Array.isArray(rawLink)) {
    const rel = (l: unknown) => (isRecord(l) ? l["@_rel"] : undefined);
    const alternate = rawLink.find((l) => rel(l) === "alternate");
    return linkHref(alternate ?? rawLink.find((l) => linkHref(l) !== null));
  }
  return linkHref(rawLink);
}

function itemId(item: Record<string, unknown>, link: string | null, title: string): string {
  const raw = item.guid ?? item.id;
  if (typeof raw === "string" && raw.trim()) return raw;
  if (isRecord(raw)) {
    const text = raw["#text"] ?? raw.text;
    if (typeof text === "string" && text.trim()) return text;
  }
  if (link) return link;
  return `title:${title}`;
}

/**
 * Parse an RSS or Atom feed into normalized news items.
 * An unparseable/garbage feed throws so partial-failure accounting upstream can react to it.
 */
export function parseFeed(xml: string, sourceUrl: string): NewsItem[] {
  // Guard against gigantic payloads (Billion laughs / oversized feeds).
  if (xml.length > MAX_XML_BYTES) {
    throw new Error(`Feed too large at ${sourceUrl} (${xml.length} bytes)`);
  }
  return parseChannel(parser.parse(xml), sourceUrl);
}

function resolveChannel(feed: unknown): Record<string, unknown> | undefined {
  const rss = isRecord(feed) ? (feed["rss"] as Record<string, unknown> | undefined) : undefined;
  const rawChannel: unknown =
    rss != null
      ? (rss.channel ?? (isRecord(feed) ? feed.channel : undefined) ?? (isRecord(feed) ? feed.feed : undefined) ?? feed)
      : ((isRecord(feed) ? feed.channel : undefined) ?? (isRecord(feed) ? feed.feed : undefined) ?? feed);
  return isRecord(rawChannel) ? rawChannel : undefined;
}

function toNewsItem(item: Record<string, unknown>, source: string): NewsItem | null {
  const link = itemLink(item);
  const title = decodeEntities(stripHtml(String(item.title ?? ""))).trim();
  if (!title || !link) return null;
  try {
    const u = new URL(String(link));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch (e) {
    console.warn("[rss] invalid link URL:", e);
    return null;
  }
  return {
    id: itemId(item, link, title),
    title,
    link: String(link),
    pubDate: textOf(item.pubDate) ?? textOf(item.published) ?? textOf(item.updated) ?? "1970-01-01T00:00:00Z",
    source,
  };
}

function parseChannel(feed: unknown, sourceUrl: string): NewsItem[] {
  const channel = resolveChannel(feed);
  if (!channel || (channel.item == null && channel.entry == null && channel.title == null)) {
    if (channel) return [];
    throw new Error(`Unrecognized feed format at ${sourceUrl}`);
  }
  let items = (channel.item ?? channel.entry ?? []) as unknown;
  if (!Array.isArray(items)) items = [items];
  const source = channelTitle(channel, sourceUrl);
  return (items as Record<string, unknown>[])
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => toNewsItem(item, source))
    .filter((x: NewsItem | null): x is NewsItem => x !== null);
}

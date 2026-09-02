import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { UpstreamError } from "@/server/infra/errors";
import { decodeEntities, stripHtml } from "./html";

/** Cap per-feed items before merging so one noisy feed cannot dominate the response. */
const MAX_ITEMS_PER_FEED = 50;

/** Maximum XML feed size in bytes (2MB) to prevent Billion Laughs attacks. */
export const MAX_XML_BYTES = 2 * 1024 * 1024;

/** Truncation caps to prevent abusive upstream titles/links from bloating cache. */
const MAX_TITLE_CHARS = 300;
const MAX_LINK_CHARS = 2048;
const MAX_ID_CHARS = 2048;

/** Accept header for RSS/Atom fetches. */
export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Harden against entity-expansion (Billion Laughs) inside the 2MB window:
  // leave entities unexpanded here; decodeEntities() normalizes text later.
  processEntities: false,
  htmlEntities: false,
});

/** Type guard for plain objects with string keys. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function sourceNameFrom(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    // Callers already count per-feed failures; stay silent to avoid log spam.
    return "Unknown";
  }
}

/** Extract text from a simple element value: a string, number, or an object with a "#text" node. */
function textOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v : null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isRecord(v)) {
    const t = v["#text"] ?? v.text;
    if (typeof t === "string" && t.trim()) return t;
    if (typeof t === "number" && Number.isFinite(t)) return String(t);
  }
  return null;
}

function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return decodeEntities(stripHtml(text).slice(0, MAX_TITLE_CHARS)).trim() || sourceNameFrom(sourceUrl);
}

function linkHref(link: unknown): string | null {
  if (typeof link === "string") return link.trim() || null;
  if (!isRecord(link)) return null;
  const href = link["@_href"] ?? link.href ?? link["#text"];
  return typeof href === "string" ? href.trim() || null : null;
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
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, MAX_ID_CHARS);
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (isRecord(raw)) {
    const text = raw["#text"] ?? raw.text;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, MAX_ID_CHARS);
    if (typeof text === "number" && Number.isFinite(text)) return String(text);
  }
  if (link) return link;
  return `title:${title}`;
}

/** UTF-8 byte length (xml.length counts UTF-16 units and undercounts CJK). */
function utf8ByteLength(s: string): number {
  // TextEncoder is available in Workers and Node 18+; fall back to a cheap
  // over-estimate (3 bytes per char) if unavailable.
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length * 3;
  }
}

/**
 * Parse an RSS or Atom feed into normalized news items.
 * An unparseable/garbage feed throws UpstreamError so partial-failure
 * accounting upstream can react to it (maps to 502, shortens TTL).
 */
export function parseFeed(xml: string, sourceUrl: string): NewsItem[] {
  // Guard against gigantic payloads (Billion laughs / oversized feeds).
  const bytes = utf8ByteLength(xml);
  if (bytes > MAX_XML_BYTES) {
    throw new UpstreamError(`Feed too large at ${sourceUrl} (${bytes} bytes)`);
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
  // Canonical shapes: <rss><channel>, bare <channel>, Atom <feed>.
  const rss = isRecord(feed.rss) ? (feed.rss as Record<string, unknown>) : undefined;
  const rawChannel: unknown = rss?.channel ?? feed.channel ?? feed.feed ?? feed;
  return isRecord(rawChannel) ? rawChannel : undefined;
}

function toNewsItem(item: Record<string, unknown>, source: string): NewsItem | null {
  const rawLink = itemLink(item);
  if (!rawLink) return null;
  const link = rawLink.trim().slice(0, MAX_LINK_CHARS);
  const title = decodeEntities(stripHtml(String(item.title ?? "")).slice(0, MAX_TITLE_CHARS)).trim();
  if (!title || !link) return null;
  try {
    const u = new URL(link);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch {
    // Invalid per-item link: skip the item silently (feed-level failures throw).
    return null;
  }
  return {
    id: itemId(item, link, title),
    title,
    link,
    pubDate: textOf(item.pubDate) ?? textOf(item.published) ?? textOf(item.updated) ?? "1970-01-01T00:00:00Z",
    source,
  };
}

function parseChannel(feed: unknown, sourceUrl: string): NewsItem[] {
  const channel = resolveChannel(feed);
  if (!channel || (channel.item == null && channel.entry == null && channel.title == null)) {
    // Garbage feed: throw so upstream partial-failure accounting shortens TTL
    // instead of caching an empty success.
    throw new UpstreamError(`Unrecognized feed format at ${sourceUrl}`);
  }
  let items = (channel.item ?? channel.entry ?? []) as unknown;
  if (!Array.isArray(items)) items = [items];
  const source = channelTitle(channel, sourceUrl);
  return (items as Record<string, unknown>[])
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => toNewsItem(item, source))
    .filter((x: NewsItem | null): x is NewsItem => x !== null);
}

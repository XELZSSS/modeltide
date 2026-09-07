import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { MAX_FEED_BYTES } from "@/server/config";
import { utf8ByteLength } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";
import { isSuitableNewsItem } from "@/server/sources/data-filter";
import { isRecord } from "@/server/parsers/primitives";
import { decodeEntities } from "@/server/parsers/entities";
import { stripHtml } from "@/server/parsers/html";

const MAX_ITEMS_PER_FEED = 50;

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
  return stripHtml(decodeEntities(stripHtml(raw)))
    .slice(0, MAX_TITLE_CHARS)
    .trim();
}

function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return cleanTitle(text) || sourceNameFrom(sourceUrl);
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
  if (/["<>\s]/.test(link)) return null;
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

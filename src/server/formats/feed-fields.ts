import type { NewsItem } from "@/shared/types";
import { isRecord, truncateSafe } from "./scalars";
import { isSuitableNewsItem, MAX_NEWS_TITLE_CHARS } from "./content-guards";
import { sourceNameFromUrl as channelHost } from "./url";
import { decodeEntities } from "./html-entities";
import { stripHtml } from "./html-to-text";

// oxlint-disable-next-line no-control-regex
const UNSAFE_LINK_CHARS_RE = /["<>\u0000-\u001f\u007f]/;
const SPACE_RE = / /g;
const MAX_LINK_CHARS = 2048;

export function textOf(v: unknown): string | null {
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
  const stripped = raw.includes("<") ? stripHtml(raw) : raw;
  const decoded = decodeEntities(stripped);
  const clean = decoded.includes("<") ? stripHtml(decoded) : decoded;
  return truncateSafe(clean, MAX_NEWS_TITLE_CHARS).trim();
}

export function channelTitle(channel: Record<string, unknown>, sourceUrl: string): string {
  const text = textOf(channel.title) ?? "";
  return cleanTitle(text) || channelHost(sourceUrl);
}

function linkHref(link: unknown): string | null {
  const raw =
    typeof link === "string" ? link : isRecord(link) ? (link["@_href"] ?? link.href ?? link["#text"]) : undefined;
  return typeof raw === "string" ? decodeEntities(raw.trim()) || null : null;
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

/**
 * The item's publication time as ISO 8601, or "" when none of the feed's date elements can be parsed.
 *
 * Feeds send this in three shapes — RFC 822 (`Sun, 01 Aug 2026 10:00:00 GMT`), ISO (`2026-08-01T10:00:00Z`) or an Atom
 * `updated` element — and the first one present used to be copied into the payload verbatim, so `NewsItem.pubDate` was
 * the only date field in the API that was not ISO. Parsing here also lets a malformed `pubDate` fall through to
 * `published`/`updated` instead of dropping the item; when no element parses the item is reported by returning "" and
 * the caller drops it, rather than shipping a date nothing downstream can read.
 */
function feedDate(item: Record<string, unknown>): string {
  for (const key of ["pubDate", "published", "updated"] as const) {
    const value = textOf(item[key])?.trim();
    if (!value) continue;
    const ts = Date.parse(value);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return "";
}

export function toNewsItem(item: Record<string, unknown>, source: string): NewsItem | null {
  const rawLink = itemLink(item);
  if (!rawLink) return null;
  const link = rawLink.trim().slice(0, MAX_LINK_CHARS).replace(SPACE_RE, "%20");
  if (UNSAFE_LINK_CHARS_RE.test(link)) return null;
  const rawTitle = textOf(item.title) ?? "";
  const title = cleanTitle(rawTitle);
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    title,
    link,
    pubDate: feedDate(item),
    source,
  };
}

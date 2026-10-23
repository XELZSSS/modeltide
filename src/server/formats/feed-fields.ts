import type { NewsItem } from "@/shared/types";
import { fnv1aHash } from "@/server/util/hash";
import { isRecord, truncateSafe } from "./scalars";
import { isSuitableNewsItem, MAX_NEWS_TITLE_CHARS } from "./content-guards";
import { sourceNameFromUrl as channelHost } from "./url";
import { decodeEntities } from "./html-entities";
import { stripHtml } from "./html-to-text";

// oxlint-disable-next-line no-control-regex
const UNSAFE_LINK_CHARS_RE = /["<>\u0000-\u001f\u007f]/;
const SPACE_RE = / /g;
const MAX_LINK_CHARS = 2048;
const MAX_ID_CHARS = 2048;
const MAX_DATE_CHARS = 64;

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

export function cleanTitle(raw: string): string {
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

function itemId(item: Record<string, unknown>, link: string | null, title: string): string {
  const guid = textOf(item.guid ?? item.id)?.trim();
  if (!guid) return link ?? `title:${title}`;
  return guid.length > MAX_ID_CHARS ? fnv1aHash(guid) : guid;
}

export function feedDate(item: Record<string, unknown>): string {
  for (const key of ["pubDate", "published", "updated"] as const) {
    const value = textOf(item[key])?.trim();
    if (value) return value.slice(0, MAX_DATE_CHARS);
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
    id: itemId(item, link, title),
    title,
    link,
    pubDate: feedDate(item),
    source,
  };
}

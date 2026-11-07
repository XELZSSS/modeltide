import type { NewsItem } from "@/shared/types";
import { isRecord, truncateSafe } from "./scalars";
import { isSuitableNewsItem, MAX_NEWS_TITLE_CHARS } from "./content-guards";
import { sourceNameFromUrl as channelHost } from "./url";
import { decodeEntities } from "./html-entities";
import { stripHtml } from "./html-to-text";
import { FEED_ALTERNATE_REL, FEED_DATE_KEYS, FEED_ELEMENTS, FEED_TEXT_KEYS } from "@/server/news/wire";
import { MAX_LINK_CHARS } from "./limits";

// oxlint-disable-next-line no-control-regex
const UNSAFE_LINK_CHARS_RE = /["<>\u0000-\u001f\u007f]/;
const SPACE_RE = / /g;

export function textOf(v: unknown): string | null {
  if (Array.isArray(v)) v = v[0];
  if (typeof v === "string") return v.trim() ? v : null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isRecord(v)) {
    for (const key of FEED_TEXT_KEYS) {
      const t = v[key];
      if (typeof t === "string" && t.trim()) return t;
      if (typeof t === "number" && Number.isFinite(t)) return String(t);
    }
  }
  return null;
}

function cleanTitle(raw: string): string {
  const stripped = raw.includes("<") ? stripHtml(raw) : raw;
  const decoded = decodeEntities(stripped);
  const clean = decoded.includes("<") ? stripHtml(decoded) : decoded;
  return truncateSafe(clean, MAX_NEWS_TITLE_CHARS).trim();
}

/**
 * The name a feed's items are attributed to, or `null` when neither the feed nor its URL names anything.
 *
 * `preferred` comes from the feed table (`news/feeds.ts`), which declares the name once per feed. A channel title is
 * written for its own site rather than for a byline beside a headline, and the live feeds proved it: `blog.google`
 * ships the title `AI` (which names nothing), TechCrunch ships `AI News & Artificial Intelligence | TechCrunch`, and
 * Google Research ships the sentence `The latest research from Google`. Those are correct channel titles and wrong
 * source names, and no structural rule can fix them: a heuristic that cut `|` tags and trailing `Blog` also turned
 * `Hugging Face - Blog` into `Hugging Face -` and `Simon Willison's Weblog` into `Simon Willison's`, so it broke two
 * names that were already right. The name is therefore declared, and the channel title is only the fallback for a feed
 * the table does not list.
 */
export function channelTitle(channel: Record<string, unknown>, sourceUrl: string, preferred?: string): string | null {
  if (preferred !== undefined) return preferred;
  const text = textOf(channel[FEED_ELEMENTS.title]) ?? "";
  return cleanTitle(text) || channelHost(sourceUrl);
}

/** Where a feed's `link` element points: a bare string, or the first of the three attributes a feed spells it in. */
function linkTargetOf(link: unknown): unknown {
  if (typeof link === "string") return link;
  if (!isRecord(link)) return undefined;
  return link[FEED_ELEMENTS.href] ?? link[FEED_ELEMENTS.hrefText] ?? link[FEED_ELEMENTS.text];
}

function linkHref(link: unknown): string | null {
  const raw = linkTargetOf(link);
  return typeof raw === "string" ? decodeEntities(raw.trim()) || null : null;
}

function itemLink(item: Record<string, unknown>): string | null {
  const rawLink = item[FEED_ELEMENTS.link];
  if (!Array.isArray(rawLink)) return linkHref(rawLink);
  const alternate = rawLink.find((l) => isRecord(l) && l[FEED_ELEMENTS.rel] === FEED_ALTERNATE_REL);
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
  for (const key of FEED_DATE_KEYS) {
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
  const rawTitle = textOf(item[FEED_ELEMENTS.title]) ?? "";
  const title = cleanTitle(rawTitle);
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    title,
    link,
    pubDate: feedDate(item),
    source,
  };
}

// Feed parser: entity decoding + tag stripping + RSS/Atom parsing.
import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/shared/types";
import { UpstreamError } from "@/server/infra";
import { isSuitableNewsItem } from "@/server/sources/data-filter";
// High-frequency named entities; unknown ones pass through untouched.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  sbquo: "\u201A",
  bdquo: "\u201E",
  lsaquo: "\u2039",
  rsaquo: "\u203A",
  laquo: "\u00AB",
  raquo: "\u00BB",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  times: "\u00D7",
  divide: "\u00F7",
  minus: "\u2212",
  micro: "\u00B5",
  deg: "\u00B0",
  plusmn: "\u00B1",
  sup2: "\u00B2",
  sup3: "\u00B3",
  frac12: "\u00BD",
  frac14: "\u00BC",
  frac34: "\u00BE",
  bull: "\u2022",
  middot: "\u00B7",
  permil: "\u2030",
  prime: "\u2032",
  Prime: "\u2033",
  oline: "\u203E",
  frasl: "\u2044",
  dagger: "\u2020",
  Dagger: "\u2021",
  sect: "\u00A7",
  para: "\u00B6",
  euro: "\u20AC",
  pound: "\u00A3",
  yen: "\u00A5",
  cent: "\u00A2",
  curren: "\u00A4",
  brvbar: "\u00A6",
  iexcl: "\u00A1",
  iquest: "\u00BF",
  ordf: "\u00AA",
  ordm: "\u00BA",
  eacute: "\u00E9",
  egrave: "\u00E8",
  agrave: "\u00E0",
  ccedil: "\u00E7",
  uuml: "\u00FC",
  ouml: "\u00F6",
  auml: "\u00E4",
  // High-frequency extras (arrows, checks, math, Latin) seen in feed titles.
  larr: "\u2190",
  uarr: "\u2191",
  rarr: "\u2192",
  darr: "\u2193",
  harr: "\u2194",
  crarr: "\u21B5",
  lArr: "\u21D0",
  uArr: "\u21D1",
  rArr: "\u21D2",
  dArr: "\u21D3",
  hArr: "\u21D4",
  check: "\u2713",
  cross: "\u2717",
  star: "\u2605",
  hearts: "\u2665",
  sup1: "\u00B9",
  frac13: "\u2153",
  frac23: "\u2154",
  frac15: "\u2155",
  frac25: "\u2156",
  infin: "\u221E",
  ne: "\u2260",
  le: "\u2264",
  ge: "\u2265",
  lowast: "\u2217",
  radic: "\u221A",
  sum: "\u2211",
  prod: "\u220F",
  part: "\u2202",
  alpha: "\u03B1",
  beta: "\u03B2",
  pi: "\u03C0",
  oelig: "\u0153",
  OElig: "\u0152",
  szlig: "\u00DF",
};

// Hex (&#x..) / decimal (&#..) with optional semicolon; named entities need one.
const ENTITY_RE = /&(?:#x([0-9a-fA-F]+);?|#([0-9]+);?|([a-zA-Z][a-zA-Z0-9]*);)/g;

/** Decode HTML entities; unknown ones pass through. */
export function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, hex?: string, dec?: string, name?: string) => {
    if (hex) return safeFromCodePoint(parseInt(hex, 16));
    if (dec) return safeFromCodePoint(parseInt(dec, 10));
    return NAMED_ENTITIES[name!] ?? m;
  });
}

// Drops invalid code points (surrogates, NUL, out-of-range) silently.
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  if (cp >= 0xd800 && cp <= 0xdfff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Block-level tags become a space when stripped. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "header",
  "footer",
  "blockquote",
  "pre",
  "hr",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
]);

function tagNameOf(tagInner: string): string {
  const m = /^[^\s/>]+/.exec(tagInner.trim());
  return (m?.[0] ?? "").toLowerCase().replace(/^\//, "");
}

/**
 * Strip tags, keep text. Quote-aware, skips comments/doctype/PI, drops
 * script/style content, maps block tags to a space.
 */
export function stripHtml(s: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    // HTML comments: skip whole <!-- ... --> block.
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const ch = s[i]!;
    if (ch !== "<") {
      parts.push(ch);
      i++;
      continue;
    }
    // CDATA: keep inner text.
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      if (end === -1) {
        parts.push(s.slice(i + 9));
        break;
      }
      parts.push(s.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    // Doctype / processing instructions: drop silently.
    if (s.startsWith("<!", i) || s.startsWith("<?", i)) {
      const end = findTagEnd(s, i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    const end = findTagEnd(s, i);
    if (end === -1) {
      parts.push("<");
      i++;
      continue;
    }
    const inner = s.slice(i + 1, end);
    const name = tagNameOf(inner);
    if (name === "script" || name === "style") {
      // Quote-aware open tag already consumed; skip until matching close.
      const closeRe = name === "script" ? /<\/script\s*>/gi : /<\/style\s*>/gi;
      closeRe.lastIndex = end + 1;
      const m = closeRe.exec(s);
      parts.push(" ");
      i = m ? m.index + m[0].length : s.length;
      continue;
    }
    parts.push(BLOCK_TAGS.has(name) ? " " : "");
    i = end + 1;
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let j = start + 1; j < html.length; j++) {
    const ch = html[j]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return j;
  }
  return -1;
}

/** Cap per-feed items so one noisy feed can't dominate. */
const MAX_ITEMS_PER_FEED = 50;

/** Max feed size (2MB) against entity-expansion attacks. */
export const MAX_XML_BYTES = 2 * 1024 * 1024;

/** Truncation caps against abusive upstream titles/links. */
const MAX_TITLE_CHARS = 300;
const MAX_LINK_CHARS = 2048;
const MAX_ID_CHARS = 2048;

/** Accept header for RSS/Atom fetches. */
export const FEED_ACCEPT = "application/rss+xml,application/xml,text/xml,*/*";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Leave entities unexpanded here; decodeEntities() normalizes text later.
  processEntities: false,
  htmlEntities: false,
});

/** Plain-object guard. */
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

/** Extract text from a string, number, or {"#text"} node. */
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
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length * 3;
  }
}

/** Parse an RSS or Atom feed; garbage throws UpstreamError (502 + short TTL). */
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
  // Unified dirty/invalid/unsuitable gate (title + link + protocol).
  if (!isSuitableNewsItem(title, link)) return null;
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

/* Shared <tr>/<td> scanners for arena + official-pricing. */

/** Inner HTML of every <tr> in document order. */
export function tableRowInners(html: string): string[] {
  const rows: string[] = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) rows.push(match[1] ?? "");
  return rows;
}

/** Stripped text of every cell in a row, in order (empties kept for indexing). */
export function rowCells(trInner: string): string[] {
  const cells: string[] = [];
  for (const match of trInner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
    cells.push(stripHtml(match[1] ?? "").trim());
  return cells;
}

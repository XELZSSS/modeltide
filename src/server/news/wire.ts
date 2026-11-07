/**
 * The syndication wire contract: the element names an RSS 2.0 or Atom document is read through.
 *
 * Twelve publishers share one reader, so these names are the whole of what the news source depends on. They used to be
 * literals spread across the parser and the field mapper — `item` versus `entry`, `@_href` versus `#text`, and the
 * `pubDate` → `published` → `updated` fallback chain — which meant a change to the fallback order was an edit in one
 * file and a hope that no other copy existed.
 */

/** The document containers a feed may nest its items in: `rss.channel`, a bare `channel`, or an Atom `feed`. */
export const FEED_CONTAINERS = ["rss", "channel", "feed"] as const;

/** The item element: RSS calls it `item`, Atom calls it `entry`, in that order of preference. */
export const FEED_ITEM_KEYS = ["item", "entry"] as const;

/** The publication time, in the order the reader tries them: RSS first, then Atom's two spellings. */
export const FEED_DATE_KEYS = ["pubDate", "published", "updated"] as const;

/** The names `link` and `title` are read through, whether the element is a string object or an attribute holder. */
export const FEED_ELEMENTS = {
  link: "link",
  title: "title",
  href: "@_href",
  hrefText: "href",
  rel: "@_rel",
  text: "#text",
} as const;

/** The two spellings an element's text arrives under: `#text` is the parser's text node, `text` a publisher's own child. */
export const FEED_TEXT_KEYS = ["#text", "text"] as const;

/** The relation that marks the article link in an Atom feed that lists several. */
export const FEED_ALTERNATE_REL = "alternate";

/**
 * The article body, kept as one opaque string: the reader never looks inside it, and building a subtree for it was the
 * largest single cost of a news refresh.
 */
export const FEED_OPAQUE_BODY_NODE = "*.content:encoded";

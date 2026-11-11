/** The syndication wire contract: the element names an RSS 2.0 or Atom document is read through. Twelve publishers share one reader, so these names are the whole of what the news source depends on: the item element, the link and title spellings, and the `pubDate` → `published` → `updated` chain. */

/* The document. `rss-feed-parser.ts` indexes both arrays below by position and `feed-cap.ts` does the same with `FEED_ITEM_KEYS`, so the order inside each of them is part of this contract. */

/** The document containers a feed may nest its items in: `rss.channel`, a bare `channel`, or an Atom `feed`. */
export const FEED_CONTAINERS = ["rss", "channel", "feed"] as const;

/** The item element: RSS calls it `item`, Atom calls it `entry`, in that order of preference. */
export const FEED_ITEM_KEYS = ["item", "entry"] as const;

/** The publication time, in the order the reader tries them: RSS first, then Atom's two spellings. */
export const FEED_DATE_KEYS = ["pubDate", "published", "updated"] as const;

/* Inside one item: the element names that carry the link and the title, the two spellings an element's text arrives under, and the relation that marks the article link. */

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

/** The article body, kept as one opaque string: the reader never looks inside it, and building a subtree for it was the largest single cost of a news refresh. */
export const FEED_OPAQUE_BODY_NODE = "*.content:encoded";

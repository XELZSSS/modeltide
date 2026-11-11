/** Cutting a feed down to the items a refresh can still reach: the byte-level pass in front of `rss-feed-parser`, which has to understand comments and CDATA sections. */
import { FEED_ITEM_KEYS } from "@/server/news/wire";

/** How many items past the wanted count are still parsed, matching the bound `parseChannel` then applies: a param that could drop an item means the kept ones can come from further down. */
export const MAX_ITEMS_SCAN_FACTOR = 4;

const ITEM_CLOSERS = FEED_ITEM_KEYS.map((key) => `</${key}>`);
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";
/** Advances `i` past a comment or CDATA section when one opens there; otherwise returns `i` unchanged. Both walks that
 * scan the document must skip the same regions: a closer inside a comment or a CDATA body is content, not an item. */
function skipOpaque(xml: string, i: number): number {
  if (xml.startsWith(COMMENT_OPEN, i)) {
    const end = xml.indexOf(COMMENT_CLOSE, i + COMMENT_OPEN.length);
    return end < 0 ? xml.length : end + COMMENT_CLOSE.length;
  }
  if (xml.startsWith(CDATA_OPEN, i)) {
    const end = xml.indexOf(CDATA_CLOSE, i + CDATA_OPEN.length);
    return end < 0 ? xml.length : end + CDATA_CLOSE.length;
  }
  return i;
}

/** The document's own container closing tags, copied verbatim after the last item closer; `undefined` when nothing follows the last item. A table of literal tails missed a namespaced or commented container and built a subtree for every item. */
function feedTail(xml: string, closer: string): string | undefined {
  // The last real item closer, skipping the comment/CDATA regions the cut scan skips: `lastIndexOf` would land on a
  // closer a trailing commented-out item carries, splicing an unmatched `-->` into the document.
  let last = -1;
  let i = 0;
  while (i < xml.length) {
    const after = skipOpaque(xml, i);
    if (after !== i) {
      i = after;
      continue;
    }
    if (xml.startsWith(closer, i)) {
      last = i + closer.length;
      i += closer.length;
      continue;
    }
    i += 1;
  }
  if (last < 0) return undefined;
  const tail = xml.slice(last);
  return tail.trim() === "" ? undefined : tail;
}

/**
 * Cuts the document after the last item the caller can still reach, so the XML parser does not build a subtree for every
 * item it will never read. A closer inside a comment or CDATA is not an item (`content:encoded` is HTML in a CDATA
 * wrapper).
 */
export function capItems(xml: string, keep: number): string {
  for (const closer of ITEM_CLOSERS) {
    let cut = -1;
    let seen = 0;
    let i = 0;
    while (i < xml.length && seen < keep) {
      const after = skipOpaque(xml, i);
      if (after !== i) {
        i = after;
        continue;
      }
      if (xml.startsWith(closer, i)) {
        seen += 1;
        i += closer.length;
        cut = i;
        continue;
      }
      i += 1;
    }
    if (seen < keep || cut < 0 || cut >= xml.length) continue;
    const tail = feedTail(xml, closer);
    // Nothing follows the last item: leave the document alone rather than append a guess.
    if (tail === undefined) continue;
    return xml.slice(0, cut) + tail;
  }
  return xml;
}
